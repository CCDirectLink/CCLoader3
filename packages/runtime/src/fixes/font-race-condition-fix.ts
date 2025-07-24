ig.module('ccloader-runtime.stdlib.font-race-condition-fix')
  .requires('impact.base.font', 'game.feature.font.font-system')
  .defines(() => {
    // this._doCallback() (that calls this.loadingFinished(true)) is called
    // before the labels are applied to ig.lang.labels, so very rarely
    // (for some reason I've only encourneted this issue in browsers,
    // it may happen in nwjs, but I'm not sure) gui code is executed before
    // the labels are applied, resulting in 'UNKNOWN LABEL'
    // (on the title screen, for example)
    ig.Lang.inject({
      onload(...args) {
        const backup = this._doCallback;
        this._doCallback = () => {};
        this.parent(...args);

        this._doCallback = backup;

        this._doCallback();
      },
    });
  });
