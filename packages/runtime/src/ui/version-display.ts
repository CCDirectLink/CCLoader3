ig.module('ccloader-runtime.ui.version-display')
  .requires(
    'game.feature.gui.base.text',
    'game.feature.gui.screen.title-screen',
    'game.feature.gui.screen.pause-screen',
  )
  .defines(() => {
    function attachCCLoaderVersionText(versionGui: sc.TextGui): sc.TextGui {
      const ccloaderVersionGui = new sc.TextGui(`CCLoader v${modloader.version}`, {
        font: sc.fontsystem.tinyFont,
      });
      ccloaderVersionGui.setAlign(versionGui.hook.align.x, versionGui.hook.align.y);
      ccloaderVersionGui.setPos(0, versionGui.hook.size.y);
      versionGui.addChildGui(ccloaderVersionGui);
      return ccloaderVersionGui;
    }

    sc.TitleScreenGui.inject({
      ccloaderVersionGui: null,

      init(...args) {
        this.parent(...args);
        this.ccloaderVersionGui = attachCCLoaderVersionText(this.versionGui);
      },
    });

    sc.PauseScreenGui.inject({
      ccloaderVersionGui: null,

      init(...args) {
        this.parent(...args);
        this.ccloaderVersionGui = attachCCLoaderVersionText(this.versionGui);
      },
    });
  });
