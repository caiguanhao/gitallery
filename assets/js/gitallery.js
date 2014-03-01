var gitallery = angular.module('gitallery', [ 'ngRoute' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.when('/', {
    templateUrl: 'main'
  });
  $locationProvider.html5Mode(false);
}]).

directive('body', [function() {
  return {
    restrict: 'E',
    templateUrl: 'index'
  };
}]).

directive('uploader', ['GitHubAPI', function(GitHubAPI) {
  return {
    link: function($scope, elem, attrs, controller) {
      elem.on('change', function() {
        var files = elem[0].files;
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          if (file.type !== 'image/jpeg') continue;
          var reader = new FileReader();
          reader.onload = function() {
            var datauri = reader.result;
            var base64str = datauri.match(/^data:(.*?);base64,(.*)$/)[2];
            GitHubAPI.UploadFile(file.name, base64str).then(function() {
              console.log(arguments)
            }, function() {
              console.log(arguments)
            });
          };
          reader.readAsDataURL(file);
        }
      });
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
  this.UpdateFile = function(fileName, fileContentBase64Encoded, fileSha) {
    var uri = [ this.API, 'repos', this.UserName, this.UserRepo, 'contents',
      fileName ];
    var data = {
      message: 'test',
      content: fileContentBase64Encoded
    };
    if (fileSha) data['sha'] = fileSha;
    return $http.put(uri.join('/'), JSON.stringify(data),
      { headers: this.headers });
  };
  this.UploadFile = function(fileName, fileContentBase64Encoded) {
    var self = this;
    return this.GetContents(fileName).then(function(response) {
      var fileSha = response.data.sha;
      return self.UpdateFile(fileName, fileContentBase64Encoded, fileSha);
    }, function(response) {
      if (response.status === 404) {
        return self.UpdateFile(fileName, fileContentBase64Encoded);
      }
      return $q.reject(response);
    });
  };
}]).

run([function() {
  // end
}]);
