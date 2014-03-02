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

directive('uploader', ['$parse', function($parse) {
  return {
    restrict: 'E',
    template: '<input type="file">',
    replace: true,
    link: function($scope, elem, attrs, controller) {
      if (!attrs.model) return;
      $scope.$watchCollection(attrs.model, function(newModel) {
        if (newModel === undefined) return;
        if (!newModel || newModel.length === 0) elem.val('');
      });
      elem.bind('change', function() {
        $scope.$apply(function() {
          var files = [];
          for (var i = 0; i < elem[0].files.length; i++) {
            var file = elem[0].files[i];
            files.push({
              name: file.name,
              file: file,
              content: null,
              message: null,
              progress: 0
            });
          }
          $parse(attrs.model).assign($scope, files);
        });
      });
    }
  };
}]).

directive('fileObject', ['$parse', function($parse) {
  return {
    link: function($scope, elem, attrs, controller) {
      var reader = new FileReader();
      var file = $parse(attrs.fileObject)($scope);
      var content = $parse(attrs.fileObject + '.content');
      reader.onload = function() {
        var datauri = reader.result;
        var base64str = datauri.match(/^data:(.*?);base64,(.*)$/)[2];
        elem.attr('src', datauri);
        content.assign($scope, base64str);
      };
      reader.readAsDataURL(file.file);
    }
  };
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
      FullName: LocalStorage('accounts.active.token'),
      Token: LocalStorage('accounts.active.token')
    };
  };
}]).

controller('MainController', ['$scope', '$q', 'GitHubAPI',
  function($scope, $q, GitHubAPI) {
  $scope.defaultMessageForFileName = function(filename) {
    return 'Upload ' + filename + '.';
  };
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
      var message = (file.message ||
        $scope.defaultMessageForFileName(file.name));
      var then = (function(file, message) {
        return function() {
          var deferred = $q.defer();
          GitHubAPI.UploadFile(file.name, file.content, message)
            .then(function(response) {
              deferred.resolve(response);
            }, function(response) {
              deferred.reject(response);
            }, function(event) {
              var progress = parseInt(100.0 * event.loaded / event.total);
              file.progress = Math.min(100, progress);
            });
          return deferred.promise;
        };
      })(file, message);
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

controller('AccountsController', ['$scope', '$window', 'LocalStorage',
  'GitHubAPI',
  function($scope, $window, LocalStorage, GitHubAPI) {

  $scope.repositoriesReadFromCache = true;
  $scope.updateRepositories = function() {
    $scope.repositories = null;
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
    $scope.repoLoadStatus = 'loading';
    if (!$scope.repositories) {
      $scope.updateRepositories();
    }
  };
  update();

  $scope.predicate = '';
  $scope.add = function() {
    var accounts = LocalStorage('accounts') || [];
    accounts.push({
      name: $scope.name,
      token: $scope.token
    });
    LocalStorage('accounts', accounts);
    update();
  };
  $scope.setActive = function(index) {
    var accounts = LocalStorage('accounts') || [];
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
}]).

run([function() {
  // end
}]);
