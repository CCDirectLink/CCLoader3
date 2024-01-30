ig.module('ccloader-runtime.stdlib.options.gui')
  .requires('game.feature.menu.gui.options.options-types')
  .defines(() => {
    sc.OptionInfoBox.inject({
      init(...args) {
        this.parent(...args);
        let [option] = args;
        if (option.marginBottom != null) {
          this.hook.size.y += option.marginBottom;
        }
      },
    });

    sc.OptionRow.inject({
      init(...args) {
        this.parent(...args);

        this.lineGui = this.hook.children[1].gui as ig.ColorGui;
        this.slopeGui = this.hook.children[2].gui as ig.ImageGui;

        if (this.option.type === 'CHECKBOX' && this.option.checkboxRightAlign) {
          let checkbox = this.typeGui as sc.OPTION_GUIS_DEFS.CHECKBOX;
          checkbox.button.hook.align.x = ig.GUI_ALIGN.X_RIGHT;
          let additionalWidth = checkbox.hook.size.x - checkbox.button.hook.size.x;
          this.lineGui.hook.size.x += additionalWidth;
          this.slopeGui.hook.pos.x += additionalWidth;
        }
      },
    });
  });
