var gitallery = angular.module('gitallery', [ 'ngRoute' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  });
  $locationProvider.html5Mode(false);
}]).

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
              message: null
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

service('GitHubAPI', ['$http', '$q', function($http, $q) {
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
    return $http.put(uri.join('/'), JSON.stringify(data),
      { headers: this.headers });
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
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var message = (file.message ||
        $scope.defaultMessageForFileName(file.name));
      promises.push(GitHubAPI.UploadFile(file.name, file.content, message));
    }
    $q.all(promises).then(function() {
      console.log(arguments);
    });
    $scope.files = null;
  };
}]).

run([function() {
  // end
}]);
