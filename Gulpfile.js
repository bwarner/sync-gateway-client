/* eslint-env node, mocha */
const exec = require('child_process').exec;
const gulp = require('gulp');
const mocha = require('gulp-mocha');
const expect = require('chai').expect;

let child;

gulp.task('start_sync_gateway', cb => {
  child = exec('sync_gateway', (err, stdout, stderr) => {
    /* eslint-disable no-console  */
    console.log('stdout ', stdout);
    console.log('stderr ', stderr);
    /* eslint-enable no-console  */
    cb(err);
  });
});

gulp.task('run-test', ['start_sync_gateway'], () => {
  gulp.src('test/**/*Spec.js')
    .pipe(mocha({
      reporter: 'spec',
      globals: {
        expect,
      },
    }));
});

gulp.task('test', ['run-test'], () => {
  if (child) {
    child.kill();
    child = undefined;
  }
});

gulp.task('default', ['test']);
