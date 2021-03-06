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

run(['$window', 'CachedImageData', '$filter', 'Gitallery',
  function($window, CachedImageData, $filter, Gitallery) {
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
          var dataURL = event.result;
          var base64str = Gitallery.GetBase64StrFromDataURL(dataURL);
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
              sha1: null,
              path: null,
              exists: 'loading'
            },
            thumb: {
              content: null
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

directive('uploader', ['$q', '$window', 'CachedImageData',
  function($q, $window, CachedImageData) {
  return {
    restrict: 'E',
    template: '<input type="file">',
    replace: true,
    scope: {
      files: '='
    },
    link: function($scope, elem, attrs, controller) {
      CachedImageData.Clear();
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

directive('previewImage', ['$window', 'GitHubAPI', 'Gitallery',
  function($window, GitHubAPI, Gitallery) {
  return {
    scope: {
      file: '=previewImage'
    },
    link: function($scope, elem, attrs, controller) {
      var makePath = function(sha, fileType) {
        if (!sha) return '';
        var ext = '';
        if (fileType === 'image/jpeg') {
          ext = '.jpg';
        }
        return sha.slice(0, 2) + '/' + sha.slice(2) + ext;
      };
      var update = function() {
        $scope.file.current.image.get(function(err, canvas) {
          if (err) return;
          var quality = $scope.file.info.quality;
          quality = Gitallery.RealQuality(quality);
          var dataURL = canvas.toDataURL($scope.file.file.type, quality);
          elem.empty().append('<img src="' + dataURL + '">');
          var base64str = Gitallery.GetBase64StrFromDataURL(dataURL);
          var hashObj = new $window.jsSHA(base64str, 'B64');
          var sha1 = hashObj.getHash('SHA-1', 'HEX');
          var size = Math.floor((base64str.length - 814) / 1.37);
          var path = makePath(sha1, $scope.file.file.type);
          $scope.file.current.sha1 = sha1;
          $scope.file.current.path = path;
          $scope.file.current.size = size;
          $scope.$apply();
          $scope.file.current.exists = 'loading';
          var photo = Gitallery.PhotosPath(path);
          GitHubAPI.GetFile(photo).then(function(file) {
            $scope.file.current.exists = file.html_url;
          }, function() {
            $scope.file.current.exists = false;
          });
          $window.FileAPI.Image(canvas).preview(200, 200).
            get(function(err, canvas) {
            if (err) return;
            var dataURL = canvas.toDataURL($scope.file.file.type, 0.9);
            $scope.file.thumb.content = dataURL;
            elem.append('<img class="thumb" src="' + dataURL + '">');
          });
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
                label: 'Custom (' + custom + '%)'
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

service('Gitallery', [function() {
  this.RealQuality = function(quality) {
    if (typeof quality === 'number' && quality >= 0 && quality <= 100) {
      quality = quality / 100;
    } else {
      quality = 0.8;
    }
    return quality;
  };
  this.GetBase64StrFromDataURL = function(dataURL) {
    if (!dataURL) return null;
    var match = dataURL.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return null
    return match[2];
  };
  this.PhotosPath = function(path) {
    return 'photos' + '/' + path;
  };
  this.ThumbsPath = function(path) {
    return 'thumbs' + '/' + path;
  };
}]).

service('GitHubAPI', ['$http', '$q', '$upload', 'Accounts', '$filter',
  function($http, $q, $upload, Accounts, $filter) {

  this.API = 'https://api.github.com';
  this.Names = function(fileName) {
    var arr = fileName.replace(/^[\/]+|[\/]+$/g, '').split(/[\/]+/);
    return {
      BaseName: arr.slice(-1)[0],
      DirName: arr.slice(0, -1).join('/')
    };
  }
  this.FullName = function() {
    return Accounts.GetCurrentAccount().FullName;
  };
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
  // get contents of file or get directory listing
  this.GetContents = function(fileName) {
    return this.Get('repos', this.FullName(), 'contents', fileName);
  };
  this.GetFile = function(fileName) {
    var names = this.Names(fileName);
    var deferred = $q.defer();
    this.GetContents(names.DirName).then(function(response) {
      var files = response.data || [];
      var file = $filter('filter')(files, { name: names.BaseName }, true);
      if (file.length === 1) {
        deferred.resolve(file[0]);
      } else {
        deferred.reject();
      }
    }, function(response) {
      deferred.reject(response);
    });
    return deferred.promise;
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
  this.UploadFile = function(fileName, fileContent, message, overwrite) {
    var self = this;
    return this.GetFile(fileName).then(function(file) {
      if (overwrite) {
        return self.UpdateFile(fileName, fileContent, message, file.sha);
      } else {
        return $q.reject('Same file already exists on repository. Aborted.');
      }
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
  this.Clear = function() {
    self.CachedData = {};
  };
}]).

service('User', ['$window', function($window) {
  this.Password = null;
  this.SetPassword = function(before) {
    var hashObj = new $window.jsSHA(before, 'TEXT');
    var after = hashObj.getHash('SHA-1', 'HEX');
    this.Password = after;
    this.RemoveAll();
  };
  this.Encrypt = function(string) {
    return $window.CryptoJS.AES.encrypt(string, this.Password).toString();
  };
  this.Decrypt = function(string) {
    return $window.CryptoJS.AES.decrypt(string, this.Password).
      toString(CryptoJS.enc.Utf8);
  };
  this.CachedData = {};
  this.Get = function(key, write) {
    if (!this.CachedData.hasOwnProperty(key)) {
      this.CachedData[key] = write();
    }
    return this.CachedData[key];
  };
  this.Remove = function(key) {
    delete this.CachedData[key];
  };
  this.RemoveAll = function(key) {
    this.CachedData = {};
  };
}]).

service('LocalStorage', ['$window', 'User', function($window, User) {
  return function(category, setValue) {
    try {
      var name = 'gitallery.' + category;
      if (setValue !== undefined) {
        if (setValue === null) {
          delete $window.localStorage[name];
        } else {
          var data = angular.toJson(setValue);
          $window.localStorage[name] = User.Encrypt(data);
        }
        User.Remove(name);
      }
      var write = function() {
        var data = $window.localStorage[name];
        return angular.fromJson(User.Decrypt(data));
      };
      return User.Get(name, write);
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

controller('MainController', ['$scope', '$q', 'GitHubAPI', 'Gitallery',
  '$window',
  function($scope, $q, GitHubAPI, Gitallery, $window) {
  $scope.controlsEnabledOverride = true;
  $scope.controlsEnabled = function() {
    if (!$scope.controlsEnabledOverride) return false;
    return $scope.files && $scope.files.length > 0;
  };
  $scope.isObjectEmpty = function(obj) {
    if (!obj) return true;
    if (typeof obj !== 'object') return true;
    var isArray = (obj instanceof Array);
    if (isArray && obj.length === 0) return true;
    if (!isArray && Object.keys(obj).length === 0) return true;
    return false;
  };
  $scope.defaultMessageForFile = function(file) {
    var title = file.info.title;
    if (typeof title !== 'string') title = '';
    title = title.replace(/\.{1,}$/, '');
    if (!title) title = 'an image';
    return 'Upload ' + title + ' (quality: ' + file.info.quality + '%).';
  };
  $scope.defaultQualityOptions = [
    {
      value: 20,
      label: "Bad (20%)"
    },
    {
      value: 50,
      label: "Half (50%)"
    },
    {
      value: 80,
      label: "Normal (80%)"
    },
    {
      value: 90,
      label: "Better (90%)"
    },
    {
      value: 100,
      label: "Best (100%)"
    },
    {
      value: -1,
      label: "Custom..."
    }
  ];
  $scope.upload = function() {
    $scope.controlsEnabledOverride = false;
    var files = $scope.files;
    if (!files || files.length === 0) {
      return alert('No files to upload!');
    }
    var deferred = $q.defer();
    var promise = deferred.promise;
    deferred.resolve();
    for (var i = 0; i < files.length; i++) {
      var file = files[i];

      var then = (function(file) {
        return function() {
          var deferred = $q.defer();
          file.current.image.get(function(err, canvas) {
            if (err) {
              deferred.reject(err);
            } else {
              var quality = file.info.quality;
              quality = Gitallery.RealQuality(quality);
              var dataURL = canvas.toDataURL(file.file.type, quality);
              var thumbDataURL = file.thumb.content;
              deferred.resolve({
                photo: dataURL,
                thumb: thumbDataURL
              });
            }
          });
          return deferred.promise;
        };
      })(file);
      promise = promise.then(then);

      var then = (function(file) {
        return function(bundle) {
          var fileName = Gitallery.PhotosPath(file.current.path);
          var message = (file.info.message ||
            $scope.defaultMessageForFile(file));
          var base64str = Gitallery.GetBase64StrFromDataURL(bundle.photo);
          var deferred = $q.defer();
          GitHubAPI.UploadFile(fileName, base64str, message, false)
            .then(function(response) {
              bundle.photo = {
                dataURL: bundle.photo,
                response: response
              };
              deferred.resolve(bundle);
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

      var then = (function(file) {
        return function(bundle) {
          var fileName = Gitallery.ThumbsPath(file.current.path);
          var message = (file.info.message ||
            $scope.defaultMessageForFile(file));
          var base64str = Gitallery.GetBase64StrFromDataURL(bundle.thumb);
          var deferred = $q.defer();
          GitHubAPI.UploadFile(fileName, base64str, message, false)
            .then(function(response) {
              bundle.thumb = {
                dataURL: bundle.thumb,
                response: response
              };
              deferred.resolve(bundle);
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

      var then = (function(file) {
        return function(bundle) {
          var thumb = bundle.photo.response.data.content;
          $scope.completed = $scope.completed || [];
          $scope.completed.push({
            name: thumb.name,
            size: thumb.size,
            url: thumb.html_url,
            image: bundle.thumb.dataURL
          });
          var deferred = $q.defer();
          deferred.resolve();
          return deferred.promise;
        };
      })(file);
      promise = promise.then(then);
    }
    promise = promise.then(function() {
      alert('All files have been uploaded.');
      $scope.files = null;
    }, function(response) {
      if (typeof response === 'string') {
        alert(response);
      } else {
        alert('Server returned a ' + response.status + ' status code.');
        console.log(response);
      }
    });
    promise['finally'](function() {
      $scope.controlsEnabledOverride = true;
    });
  };
}]).

controller('AccountsController', ['$scope', '$window', '$filter', 'User',
  'LocalStorage', 'GitHubAPI', '$route',
  function($scope, $window, $filter, User, LocalStorage, GitHubAPI, $route) {

  $scope.User = User;
  $scope.reload = function() {
    User.SetPassword($scope.Password);
    $scope.Password = null;
    $route.reload();
  };

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
      var repos = [];
      for (var i = 0; i < repositories.length; i++) {
        var r = repositories[i];
        repos.push({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          permissions: r.permissions
        });
      }
      $scope.repositories = repos;
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

  $scope.predicate = 'id';
  $scope.reverse = true;

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
