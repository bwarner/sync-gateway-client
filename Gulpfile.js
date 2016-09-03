/* eslint-env node, mocha */
/* eslint-disable import/no-extraneous-dependencies */
const exec = require('child_process').exec;
const gulp = require('gulp');
const eslint = require('gulp-eslint');
const jsdoc = require('gulp-jsdoc3');
const jsDocConfig = require('./jsdoc.json');
const mocha = require('gulp-mocha');
const expect = require('chai').expect;

const srcCode = ['./lib/**/*.js'];
const specs = ['test/**/*Spec.js'];
const lintedFiles = ['*.js', './test/**/*.js'].concat(srcCode);

let child;


gulp.task('lint', () =>
  gulp.src(lintedFiles)
             .pipe(eslint())
             .pipe(eslint.format())
             .pipe(eslint.failOnError())
);

gulp.task('watch-lint', () => {
  gulp.watch(lintedFiles, ['lint']);
});

gulp.task('doc', (cb) => {
  gulp.src(['README.md'].concat(srcCode), { read: false })
      .pipe(jsdoc(jsDocConfig, cb));
});

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
  gulp.src(specs)
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
