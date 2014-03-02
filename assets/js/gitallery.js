var gitallery = angular.module('gitallery',
  [ 'ngRoute', 'angularFileUpload' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  });
  $locationProvider.html5Mode(false);
}]).

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

service('GitHubAPI', ['$http', '$q', '$upload', function($http, $q, $upload) {
  var lS = window.localStorage;

  this.API = 'https://api.github.com';
  this.UserName = lS['username'];
  this.UserRepo = lS['userrepo'];
  this.headers = {
    "Authorization": "token " + lS['token']
  };

  this.GetContents = function(fileName) {
    var uri = [ this.API, 'repos', this.UserName, this.UserRepo, 'contents',
      fileName ];
    return $http.get(uri.join('/'), { headers: this.headers });
  };
  this.UpdateFile = function(fileName, fileContent, message, fileSha) {
    var uri = [ this.API, 'repos', this.UserName, this.UserRepo, 'contents',
      fileName ];
    var data = {
      message: message,
      content: fileContent
    };
    if (fileSha) data['sha'] = fileSha;
    return $upload.http({
      url: uri.join('/'),
      method: 'PUT',
      headers: this.headers,
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

run([function() {
  // end
}]);
