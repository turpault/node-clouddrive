'use strict';

let fs = require('fs'),
  Command = require('./Command'),
  Node = require('../Node'),
  chalk = require('chalk'),
  async = require('async'),
  path = require('path'),
  Utils = require('../Utils');

class UploadCommand extends Command {
  run(args, options) {
    return new Promise((resolve, reject) => {
      let remoteFolder = args.pop();

      this.initialize((err, data) => {
        if (err) {
          return reject(err);
        }

        if (args.length === 0) {
          return reject(Error('Destination path must be specified'));
        }

        async.forEachSeries(args, (localPath, callback) => {
          localPath = path.resolve(localPath);

          remoteFolder = Utils.getPathArray(remoteFolder);
          remoteFolder.push(Utils.getPathArray(localPath).pop());
          remoteFolder = remoteFolder.join('/');

          let iterateDirectory = (directory, callback) => {
            fs.readdir(directory, (err, list) => {
              if (err) {
                return callback(err);
              }

              if (list.length === 0) {
                return callback();
              }

              async.forEachSeries(list, (item, callback) => {
                let itemPath = `${directory}/${item}`;
                fs.stat(itemPath, (err, stat) => {
                  if (err) {
                    return callback(err);
                  }

                  if (stat.isDirectory()) {
                    return iterateDirectory(itemPath, callback);
                  }

                  let remoteFile = itemPath.replace(localPath, remoteFolder);
                  Node.exists(remoteFile, itemPath, (err, result) => {
                    if (!result.success) {
                      Command.error(`File ${remoteFile} does not exist`);

                      return callback();
                    }

                    if (result.data.pathMatch && result.data.md5Match) {
                      Command.info(`File ${remoteFile} exists and is identical to local copy`);
                    } else if (result.data.pathMatch) {
                      Command.warn(`File ${remoteFile} exists but does not match local copy`);
                    } else {
                      Command.warn(`File ${remoteFile} exists at the following location: ${result.data.nodes.join(', ')}`);
                    }

                    return callback();
                  });
                });
              }, err => {
                callback(err);
              });
            });
          };

          iterateDirectory(localPath, callback);
        }, err => {
          if (err) {
            return reject(err);
          }

          return resolve();
        });
      });
    });
  }
}

module.exports = UploadCommand;
