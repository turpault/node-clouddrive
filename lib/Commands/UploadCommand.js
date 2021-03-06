'use strict';

let fs = require('fs'),
  Command = require('./Command'),
  Node = require('../Node'),
  chalk = require('chalk'),
  ProgressBar = require('progress'),
  async = require('async'),
  logUpdate = require('log-update'),
  Utils = require('../Utils');

class UploadCommand extends Command {
  run(args, options) {
    return new Promise((resolve, reject) => {
      let remotePath = args.pop();

      this.initialize((err, data) => {
        if (err) {
          return reject(err);
        }

        if (!data.success) {
          return reject(Error('Account not authorized with Amazon Cloud Drive. Run `init` command first.'));
        }

        if (args.length === 0) {
          return reject(Error('Destination path must be specified'));
        }

        let bar = null,
          localFilesize = null,
          bytesUploaded = null,
          bytesDispatched = 0,
          lastRun = null,
          opts = {
            force: options.force ? true : false,
            ignoreFiles: this.config.get('cli.ignoreFiles'),
            retryAttempt: 0,
            numRetries: this.config.get('upload.numRetries'),
            suppressDedupe: this.config.get('upload.duplicates'),
            onFileUpload: (localPath, callback) => {
              if (this.config.get('cli.progressBars')) {
                bytesUploaded = 0;
                localFilesize = fs.statSync(localPath)['size'];
                lastRun = Date.now();
                bar = new ProgressBar(`:percent[:bar] :speed eta :etas (:current / :total bytes)`, {
                  complete: '=',
                  incomplete: ' ',
                  width: 20,
                  total: localFilesize,
                  clear: true,
                  print: false,
                  renderThrottle: this.config.get('cli.progressInterval')
                });
              }

              return callback();
            },
            onFileProgress: (localPath, chunk) => {
              if (bar) {
                bytesDispatched += chunk.length;
                bytesUploaded += bytesDispatched;

                let message = `Uploading '${localPath}'`,
                  timeDiff = Date.now() - lastRun;

                if (timeDiff >= this.config.get('cli.progressInterval') || bytesUploaded >= localFilesize) {
                  lastRun = Date.now();
                  bytesDispatched = 0;
                  bar.tick(chunk.length, {
                    speed: `${Utils.convertFileSize(Math.round(bytesDispatched * 1000 / timeDiff), 2)}/s`
                  });
                  message += `\n${bar.lastDraw}`;
                  logUpdate(message);
                }
              }
            },
            onFileComplete: (response, body, retval, data, callback) => {
              // Clear out progress bar
              if (bar !== null && !bar.complete) {
                bar.tick(localFilesize);
                bar = null;
                localFilesize = null;
              }

              logUpdate.clear();

              if (response) {
                Command.log(`Response returned with status code ${response.status}`, 3);

                if (!body) {
                  Command.error(`Error: Failed to upload file '${data.localPath}'. Invalid body return with status code ${response.statusCode}: ${body}`);

                  return callback();
                }
              }

              if (retval.success) {
                Command.info(`Successfully uploaded file '${data.localPath}' to '${data.remotePath}'`);
              } else {
                let message = `Failed to upload file '${data.localPath}'`;

                if (retval.data.message) {
                  message += `: ${retval.data.message}`;
                } else {
                  message += `: ${JSON.stringify(retval.data)}`;
                }

                if (retval.data.exists === true) {
                  if (retval.data.md5Match === true && retval.data.pathMatch === true) {
                    Command.warn(message);
                  } else {
                    Command.error(message);
                  }
                } else {
                  if (retval.data.retry !== undefined && retval.data.retry === true) {
                    Command.warn(message);
                  } else {
                    Command.error(message);
                  }
                }
              }

              return callback();
            }
          };

        if (options.overwrite) {
          opts.overwrite = true;
        }

        async.forEachSeries(args, (localPath, callback) => {
          try {
            fs.statSync(localPath);
          } catch (e) {
            return reject(Error(`No file exists at '${localPath}'`));
          }

          if (fs.lstatSync(localPath).isDirectory()) {
            return Node.uploadDirectory(localPath, remotePath, opts, (err, data) => {
              if (err) {
                return reject(err);
              }

              callback();
            });
          }

          Node.uploadFile(localPath, remotePath, opts, (err, data) => {
            if (err) {
              return reject(err);
            }

            callback();
          });
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
