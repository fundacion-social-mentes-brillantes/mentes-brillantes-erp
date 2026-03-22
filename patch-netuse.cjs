// Patch child_process.exec to avoid spawning "net use" in Vitest on Windows CI
const childProcess = require('node:child_process');

childProcess.exec = function execPatched(command, options, callback) {
  if (typeof options === 'function') {
    callback = options;
  }
  if (typeof callback === 'function') {
    callback(null, '', '');
  }
  return {
    kill() {},
    stdout: null,
    stderr: null,
    on() {
      return this;
    },
  };
};
