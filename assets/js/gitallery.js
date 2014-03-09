var gitallery = angular.module('gitallery',
  [ 'ngRoute', 'angularFileUpload' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.
  when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  }).
  when('/accounts', {
    templateUrl: 'accounts',
    controller: 'AccountsController'
  }).
  otherwise({
    title: '404 Page Not Found',
    templateUrl: '_404'
  });
  $locationProvider.html5Mode(false);
}]).

run(['$window', 'CachedImageData', '$filter',
  function($window, CachedImageData, $filter) {
  function convertDate(date) {
    if (!date) return null;
    var d = date.split(/:|-|\s/).map(function(s) { return +s; });
    return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5]);
  }
  // add EXIF reader
  $window.FileAPI.addInfoReader(/^image/, function (file, callback){
    $window.FileAPI.readAsDataURL(file, function(event) {
      if (event.type === 'load') {
        var fileObjHash = $window.btoa(JSON.stringify(file));
        var write = function() {
          var dataURI = event.result;
          var base64str = dataURI.match(/^data:(.*?);base64,(.*)$/)[2];
          var bin = new $window.BinaryFile($window.atob(base64str));
          var exif = $window.EXIF.readFromBinaryFile(bin);
          var hashObj = new $window.jsSHA(base64str, 'B64');
          var sha1 = hashObj.getHash('SHA-1', 'HEX');
          var cDate = convertDate(exif.DateTimeOriginal) ||
                      convertDate(exif.DateTimeDigitized) ||
                      convertDate(exif.DateTime);
          var mDate = file.lastModifiedDate;
          var title = file.name;
          title = title.replace(/\.jpg$/i, '');
          return {
            exif: exif || {},
            original: {
              sha1: sha1
            },
            current: {
              image: $window.FileAPI.Image(file),
              size: 0,
              sha1: null
            },
            info: {
              title: title,
              message: null,
              progress: 0,
              cdate: $filter('date')(cDate || mDate, 'yyyy-MM-dd HH:mm:ss'),
              mdate: $filter('date')(mDate, 'yyyy-MM-dd HH:mm:ss'),
              rotation: 'auto',
              quality: 80
            }
          };
        };
        var data = CachedImageData.Get(fileObjHash, write);
        callback(false, data);
      } else if (event.type === 'error') {
        callback(true);
      }
    });
  });
}]).

filter('length', function() {
  return function(array) {
    return array instanceof Array ? array.length : 0;
  };
}).

filter('filesize', function() {
  return function(size) {
    return filesize(size, { base: 2 });
  };
}).

directive('body', [function() {
  return {
    restrict: 'E',
    templateUrl: 'index'
  };
}]).

directive('navbarLink', ['$location', function($location) {
  return function(scope, element, attrs) {
    scope.$on('$routeChangeSuccess', function(event, current, previous) {
      var links = element.find('a');
      if (links.length === 0) return;
      var href = links.attr('href').replace(/^\/#!?/, '');
      var url = $location.url();
      if ((href === '/' && url === href) ||
        (href !== '/' && url.substr(0, href.length) === href)) {
        element.addClass('active');
      } else {
        element.removeClass('active');
      }
    });
  };
}]).

directive('uploader', ['$q', '$window',
  function($q, $window) {
  return {
    restrict: 'E',
    template: '<input type="file">',
    replace: true,
    scope: {
      files: '='
    },
    link: function($scope, elem, attrs, controller) {
      if (!attrs.files) return;
      $scope.$watchCollection(attrs.files, function(newModel) {
        if (newModel === undefined) return;
        if (!newModel || newModel.length === 0) elem.val('');
      });
      elem.bind('change', function() {
        $scope.$apply(function() {
          var promises = [];
          for (var i = 0; i < elem[0].files.length; i++) {
            var file = elem[0].files[i];
            var deferred = $q.defer();
            $window.FileAPI.getInfo(file, (function(deferred, file) {
              return function(err, info) {
                if (err) {
                  deferred.reject(err);
                } else {
                  deferred.resolve(angular.extend({ file: file }, info));
                }
              };
            })(deferred, file));
            promises.push(deferred.promise);
          }
          $q.all(promises).then(function(results) {
            var files = [];
            for (var i = 0; i < results.length; i++) {
              files.push(results[i]);
            }
            $scope.files = files;
          });
        });
      });
    }
  };
}]).

directive('previewImage', ['$window', function($window) {
  return {
    scope: {
      file: '=previewImage'
    },
    link: function($scope, elem, attrs, controller) {
      var update = function() {
        $scope.file.current.image.get(function(err, canvas) {
          if (err) return;
          var quality = $scope.file.info.quality;
          if (typeof quality === 'number' && quality >= 0 && quality <= 100) {
            quality = quality / 100;
          } else {
            quality = 0.8;
          }
          var dataURL = canvas.toDataURL($scope.file.file.type, quality);
          elem.empty().append('<img src="' + dataURL + '">');
          var base64str = dataURL.match(/^data:(.*?);base64,(.*)$/)[2];
          var hashObj = new $window.jsSHA(base64str, 'B64');
          var sha1 = hashObj.getHash('SHA-1', 'HEX');
          var size = Math.floor((base64str.length - 814) / 1.37);
          $scope.file.current.sha1 = sha1;
          $scope.file.current.size = size;
          $scope.$apply();
        });
      };
      $scope.$watch('file.info.rotation', function(after, before) {
        $scope.file.current.image.rotate(after);
        update();
      });
      $scope.$watch('file.info.quality', update);
    }
  };
}]).

directive('allowCustomOption', ['$window', '$filter',
  function($window, $filter) {
  return {
    scope: {
      model: '=ngModel',
      defaultQualityOptions: '=allowCustomOptionOptions'
    },
    link: function($scope, elem, attrs) {
      elem.on('change', function() {
        if ($scope.model === +attrs.allowCustomOptionIdentity) {
          var custom = $window.prompt(attrs.allowCustomOption);
          if (!custom || (attrs.allowCustomOptionRegEx &&
            !(new RegExp(attrs.allowCustomOptionRegEx)).test(custom))) {
            $scope.model = +attrs.allowCustomOptionDefault;
          } else {
            var opts = $scope.defaultQualityOptions, exist = false;
            var c = $filter('filter')(opts, { value: +custom }, true);
            if (c.length === 0) {
              $scope.defaultQualityOptions.splice(opts.length - 1, 0, {
                value: +custom,
                label: 'Custom (' + custom + ')'
              });
            }
            $scope.model = +custom;
          }
          $scope.$apply();
        }
      });
    }
  }
}]).

service('GitHubAPI', ['$http', '$q', '$upload', 'Accounts',
  function($http, $q, $upload, Accounts) {

  this.API = 'https://api.github.com';
  this.FullName = function() {
    return Accounts.GetCurrentAccount().FullName;
  }
  this.Headers = function() {
    return {
      "Authorization": "token " + Accounts.GetCurrentAccount().Token
    };
  };
  this.BuildURL = function(/* ... */) {
    return [this.API].concat(Array.prototype.slice.apply(arguments)).join('/');
  };
  this.Get = function(/* ... */) {
    var url = this.BuildURL.apply(this, arguments);
    return $http.get(url, { headers: this.Headers() });
  };

  this.GetRepositories = function() {
    return this.Get('user', 'repos');
  };
  this.GetAllRepositories = function() {
    var self = this;
    var deferred = $q.defer();
    var promises = [];
    promises.push(this.GetRepositories());
    this.GetOrganizations().then(function(response) {
      var orgs = response.data;
      for (var i = 0; i < orgs.length; i++) {
        promises.push(self.GetOrganizationRepositories(orgs[i].login));
      }
      deferred.resolve($q.all(promises));
    }, function(response) {
      deferred.reject(response);
    });
    return deferred.promise;
  };
  this.GetOrganizations = function() {
    return this.Get('user', 'orgs');
  };
  this.GetOrganizationRepositories = function(orgname) {
    return this.Get('orgs', orgname, 'repos');
  };
  this.GetContents = function(fileName) {
    return this.Get('repos', this.FullName(), 'contents', fileName);
  };
  this.UpdateFile = function(fileName, fileContent, message, fileSha) {
    var url = this.BuildURL('repos', this.FullName(), 'contents', fileName);
    var data = {
      message: message,
      content: fileContent
    };
    if (fileSha) data['sha'] = fileSha;
    return $upload.http({
      url: url,
      method: 'PUT',
      headers: this.Headers(),
      data: JSON.stringify(data)
    });
  };
  this.UploadFile = function(fileName, fileContent, message) {
    var self = this;
    return this.GetContents(fileName).then(function(response) {
      var fileSha = response.data.sha;
      return self.UpdateFile(fileName, fileContent, message, fileSha);
    }, function(response) {
      if (response.status === 404) {
        return self.UpdateFile(fileName, fileContent, message, null);
      }
      return $q.reject(response);
    });
  };
}]).

service('CachedImageData', ['$window', function($window) {
  var self = this;
  this.CachedData = {};
  this.Get = function(imageHash, writeData) {
    if (!self.CachedData.hasOwnProperty(imageHash)) {
      self.CachedData[imageHash] = writeData();
    }
    return self.CachedData[imageHash];
  };
}]).

service('LocalStorage', ['$window', function($window) {
  return function(category, setValue) {
    try {
      var name = 'gitallery.' + category;
      if (setValue !== undefined) {
        if (setValue === null) {
          delete $window.localStorage[name];
        } else {
          $window.localStorage[name] = angular.toJson(setValue);
        }
      }
      return angular.fromJson($window.localStorage[name]);
    } catch(e) {}
    return null;
  };
}]).

service('Accounts', ['LocalStorage', function(LocalStorage) {
  this.GetCurrentAccount = function() {
    return {
      FullName: LocalStorage('accounts.active.full_name'),
      Token: LocalStorage('accounts.active.token')
    };
  };
}]).

controller('MainController', ['$scope', '$q', 'GitHubAPI',
  function($scope, $q, GitHubAPI) {
  $scope.defaultMessageForFileName = function(filename) {
    if (typeof filename !== 'string') filename = '';
    filename = filename.replace(/\.{1,}$/, '');
    if (!filename) filename = 'an image';
    return 'Upload ' + filename + '.';
  };
  $scope.makePath = function(sha, fileType) {
    if (!sha) return '';
    var ext = '';
    if (fileType === 'image/jpeg') {
      ext = '.jpg';
    }
    return sha.split('', 2).concat(sha+ext).join('/');
  };
  $scope.defaultQualityOptions = [
    {
      value: 20,
      label: "Bad (20)"
    },
    {
      value: 50,
      label: "Half (50)"
    },
    {
      value: 80,
      label: "Normal (80)"
    },
    {
      value: 100,
      label: "Best (100)"
    },
    {
      value: -1,
      label: "Custom..."
    }
  ];
  $scope.upload = function() {
    var files = $scope.files;
    if (!files || files.length === 0) {
      return alert('No files to upload!');
    }
    var deferred = $q.defer();
    var promise = deferred.promise;
    deferred.resolve();
    for (var i = 0; i < files.length; i++) {
      var file = files[i];

      promise = promise.then((function(file) {
        return function() {
          var deferred = $q.defer();
          file.current.image.get(function(err, canvas) {
            if (err) {
              deferred.reject(err);
            } else {
              var quality = file.info.quality;
              if (typeof quality === 'number' && quality >= 0 && quality <= 100) {
                quality = quality / 100;
              } else {
                quality = 0.8;
              }
              var dataURL = canvas.toDataURL(file.file.type, quality);
              var base64str = dataURL.match(/^data:(.*?);base64,(.*)$/)[2];
              deferred.resolve(base64str);
            }
          });
          return deferred.promise;
        };
      })(file));

      var then = (function(file) {
        return function(base64str) {
          var fileName = $scope.makePath(file.current.sha1, file.file.type);
          var message = (file.info.message ||
            $scope.defaultMessageForFileName(file.info.title));
          var deferred = $q.defer();
          GitHubAPI.UploadFile(fileName, base64str, message)
            .then(function(response) {
              deferred.resolve(response);
            }, function(response) {
              deferred.reject(response);
            }, function(event) {
              var progress = parseInt(100.0 * event.loaded / event.total);
              file.info.progress = Math.min(100, progress);
            });
          return deferred.promise;
        };
      })(file);
      promise = promise.then(then);
    }
    promise = promise.then(function() {
      console.log('come to an end', arguments);
    }, function() {
      console.log('come to an error', arguments);
    });
    promise['finally'](function() {
      $scope.files = null;
    });
  };
}]).

controller('AccountsController', ['$scope', '$window', '$filter',
  'LocalStorage', 'GitHubAPI',
  function($scope, $window, $filter, LocalStorage, GitHubAPI) {

  $scope.repositoriesReadFromCache = true;
  $scope.updateRepositories = function() {
    $scope.repositories = null;
    if (!$scope.activeToken) return;
    $scope.repoLoadStatus = 'loading';
    GitHubAPI.GetAllRepositories().then(function(response) {
      var repositories = [];
      for (var i = 0; i < response.length; i++) {
        repositories = repositories.concat(response[i].data);
      }
      $scope.repositories = repositories;
    }, function(response) {
      if (response.status === 401) {
        $scope.repoLoadStatus = 'unauthorized';
      } else {
        $scope.repoLoadStatus = response.data.message || 'Unknown Error';
      }
      $scope.repositories = null;
    }).finally(function() {
      LocalStorage('accounts.active.repositories', $scope.repositories);
      $scope.repositoriesReadFromCache = false;
    });
  };

  var clean = function() {
    LocalStorage('accounts.active.token', null);
    LocalStorage('accounts.active.full_name', null);
    LocalStorage('accounts.active.repositories', null);
  };

  var update = function() {
    $scope.accounts = LocalStorage('accounts');
    $scope.activeToken = LocalStorage('accounts.active.token');
    $scope.activeFullName = LocalStorage('accounts.active.full_name');
    $scope.repositories = LocalStorage('accounts.active.repositories');
    $scope.repoLoadStatus = 'initial';
    if (!$scope.repositories) {
      $scope.updateRepositories();
    }
  };
  update();

  $scope.predicate = '';
  $scope.add = function() {
    var token = $scope.token;
    if (!/^[a-f0-9]{1,40}$/.test(token)) return alert('Not a valid token.');
    if ($scope.index(token) !== -1) return alert('Already added.');
    var accounts = LocalStorage('accounts') || [];
    var name = $scope.name;
    if (!name) name = $filter('date')(new Date, 'yyyy-MM-dd HH:mm:ss');
    accounts.push({
      name: name,
      token: token
    });
    LocalStorage('accounts', accounts);
    $scope.selectAccount();
    update();
    $scope.name = null;
    $scope.token = null;
  };
  $scope.index = function(token) {
    if (!($scope.accounts instanceof Array)) return -1;
    for (var i = 0; i < $scope.accounts.length; i++) {
      if ((token || $scope.activeToken) === $scope.accounts[i].token) {
        return i;
      }
    }
    return -1;
  }
  $scope.rename = function() {
    var index = $scope.index();
    if (index === -1) return;
    var account = $scope.accounts[index];
    var newName = $window.prompt('Enter new name:', account.name);
    if (!newName) return;
    account.name = newName;
    LocalStorage('accounts', $scope.accounts);
    update();
  };
  $scope.remove = function() {
    var index = $scope.index();
    if (index === -1) return;
    if ($scope.accounts[index].token === $scope.activeToken) {
      clean();
      LocalStorage('accounts.active.token', null);
    }
    $scope.accounts.splice(index, 1);
    LocalStorage('accounts', $scope.accounts);
    update();
  };
  $scope.selectAccount = function(index) {
    var accounts = LocalStorage('accounts') || [];
    if (index === undefined) index = accounts.length - 1;
    if (index > -1 && index < accounts.length) {
      clean();
      LocalStorage('accounts.active.token', accounts[index].token);
      update();
    }
  };
  $scope.selectRepo = function(repo) {
    LocalStorage('accounts.active.full_name', repo.full_name);
    update();
  };
  $scope.activeFullNameIndex = function() {
    if (!($scope.repositories instanceof Array)) return -1;
    for (var i = 0; i < $scope.repositories.length; i++) {
      if ($scope.activeFullName === $scope.repositories[i].full_name) {
        return i;
      }
    }
    return -1;
  };
}]).

run([function() {
  // end
}]);
