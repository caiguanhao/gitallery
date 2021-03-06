module.exports = function(grunt) {

  grunt.initConfig({
    less: {
      gitallery: {
        files: {
          'public/css/gitallery.css': [ 'assets/css/gitallery.less' ]
        }
      }
    },
    connect: {
      server: {
        options: {
          hostname: '*',
          port: process.env.PORT || 3000,
          base: [ 'assets', 'public' ]
        }
      }
    },
    watch: {
      options: {
        livereload: true
      },
      grunt: {
        files: [ 'Gruntfile.js' ]
      },
      js: {
        files: [ 'assets/js/**/*' ]
      },
      css: {
        files: [ 'assets/css/**/*' ],
        tasks: [ 'less' ]
      },
      html: {
        files: [ 'index.html' ],
        tasks: [ 'copy-index' ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('default', [
    'less',
    'copy-index',
    'connect',
    'watch'
  ]);

  function get_local_ip() {
    var interfaces = require('os').networkInterfaces();
    for (var dev in interfaces) {
      if (dev.substr(0, 2) === 'en') {
        var iface = interfaces[dev];
        for (var i = 0; i < iface.length; i++) {
          if (iface[i].family === 'IPv4') {
            return iface[i].address;
          }
        }
      }
    }
    return 'localhost';
  }
  var local_ip = get_local_ip();

  grunt.registerTask('copy-index', 'Copy index page', function() {
    var index = grunt.file.read('index.html');
    index = index.replace('{%LOCAL-IP%}', local_ip);
    var local_password = process.env.LOCALPWD;
    index = index.replace('{%LOCAL-PASSWORD%}', local_password);
    if (!local_password) grunt.log.errorlns('Local password is empty.');
    grunt.file.write('public/index.html', index);
    grunt.log.ok('Copied index.html to public/index.html.');
  });

  grunt.registerTask('download-angular', 'Download Angular',
    function(version) {
    var http = require('http');
    var fs = require('fs');
    var path = require('path');
    var finish = this.async();
    var base = 'http://code.angularjs.org/';
    var urls = [];
    var url_index = 0;
    var needs = [
      'angular.js',
      'angular-route.js'
    ];
    var need_latest = false;
    if (version === 'latest') {
      version = '';
      need_latest = true;
    }
    function get_versions(callback) {
      grunt.log.write('Getting list of Angular versions... ');
      http.get(base, function(response) {
        var list = '';
        response.on('data', function(data) {
          list += data;
        });
        response.on('end', function() {
          var versions = list.replace(/(<([^>]+)>)/ig, '')
            .match(/\d+\.\d+\.[^\/]+/g);
          var max_width = 0;
          versions.sort(function(a, b) {
            if (a.length > max_width) max_width = a.length;
            var _a = a.split(/[^\d]+/), _b = b.split(/[^\d]+/),
              _l = Math.min(_a.length, _b.length);
            for (var i = 0; i < _l; i++) {
              if (+_a[i] === +_b[i]) {
                continue;
              } else if (+_a[i] > +_b[i]) {
                return 1;
              } else {
                return -1;
              }
            }
            return 0;
          });
          var vers_l = versions.length;
          var item_width = max_width + 1;
          var columns = process.stdout.columns;
          var cols = Math.floor(columns / item_width);
          var start = Math.max(vers_l - 3 * cols, 0);
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          if (need_latest) {
            if (callback) callback(versions[vers_l - 1]);
            return;
          }
          console.log('List of some versions of Angular available for ' +
            'download:');
          for (var i = start; i < vers_l; i++) {
            var ver = versions[i];
            process.stdout.write(ver + Array(item_width - ver.length + 1)
              .join(' '));
            if ((i - start) % cols === cols - 1 && i !== vers_l - 1) {
              process.stdout.write('\n');
            }
          }
          process.stdout.write('\n');
          var readline = require('readline');
          var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl.setPrompt('Enter one version number to download: ');
          rl.prompt();
          rl.write(versions[vers_l - 1]);
          rl.on('line', function(v) {
            v = v.trim();
            if (versions.indexOf(v) === -1) {
              rl.prompt();
            } else {
              rl.close()
              if (callback) callback(v);
            }
          });
        });
      });
    }
    function numfmt(n) {
      return n.toString().split('').reverse().join('')
              .replace(/(\d{3})/g, '$1,').split('')
              .reverse().join('').replace(/^,/, '');
    }
    function mkdir(/* ... */) {
      for (var i = 0; i < arguments.length; i++) {
        var dir = path.join.apply(null,
          Array.prototype.slice.call(arguments, 0, i + 1));
        if (fs.existsSync(dir)) {
          if (fs.lstatSync(dir).isDirectory()) continue;
          fs.unlinkSync(dir);
        }
        fs.mkdirSync(dir);
      }
    }
    function download(callback) {
      var url = urls[url_index];
      var filename = path.basename(url);
      mkdir('assets', 'js', 'vendor');
      var file = fs.createWriteStream('assets/js/vendor/' + filename);
      grunt.log.write('Start downloading ' + url + '...');
      http.get(url, function(response) {
        if (response.statusCode !== 200) {
          process.stdout.write('\n');
          throw new Error('Fail to download. Status: ' + response.statusCode);
        }
        var total = parseInt(response.headers['content-length']);
        var acc = 0;
        response.on('data', function(data) {
          file.write(data);
          acc += data.length;
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          process.stdout.write((acc / total * 100).toFixed(2) + '%, ' +
            numfmt(acc) + ' of ' + numfmt(total) + ' bytes of ' + filename +
            ' downloaded... ');
        });
        response.on('end', function() {
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          grunt.log.ok('Downloaded ' + url);

          url_index++;
          if (urls[url_index]) {
            download(callback);
          } else {
            callback();
          }
        });
      }).on('error', function(error) {
        grunt.fail.fatal(error);
      });
    }
    function to_download(callback) {
      base += version + '/';
      needs.forEach(function(need) {
        urls.push(base + need);
        urls.push(base + need.replace(/\.js$/, '.min.js'));
      });
      download(callback);
    }
    if (!version) {
      get_versions(function(v) {
        version = v;
        to_download(finish);
      });
    } else {
      to_download(finish);
    }
  });

};
