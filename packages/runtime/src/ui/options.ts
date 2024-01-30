/* eslint-disable @typescript-eslint/no-dynamic-delete */

import * as utils from './utils';
import * as consoleM from '@ccloader3/common/console';
import * as resources from '../resources';

const LOG_LEVEL_OPTION_IDS: consoleM.LogLevelsDict<string> = {
  LOG: 'logLevel-log',
  WARN: 'logLevel-warn',
  ERROR: 'logLevel-error',
};

const MOD_ENABLED_OPTION_ID_PREFIX = 'modEnabled-';

const INSTALLED_MODS: modloader.Mod[] = Array.from(modloader.installedMods.values())
  .filter((mod) => mod !== modloader._runtimeMod)
  // TODO: sort this based on the localized title, see
  // <https://stackoverflow.com/questions/2140627/how-to-do-case-insensitive-string-comparison>
  .sort((mod1, mod2) => utils.compare(mod1.id, mod2.id));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
resources.jsonPatches.add('data/lang/sc/gui.en_US.json', (data: any) => {
  let { options } = data.labels;
  for (let mod of INSTALLED_MODS) {
    options[`modEnabled-${mod.id}`] = {
      name: utils.getModTitle(mod) || ' ',
      description: utils.getLocalizedString(mod.manifest.description) || ' ',
    };
  }
});

ig.module('ccloader-runtime.ui.options')
  .requires(
    'impact.base.font',
    'game.feature.font.font-system',
    'game.feature.model.options-model',
    'game.feature.menu.gui.options.options-list',
    'game.feature.menu.gui.options.options-types',
  )
  .defines(() => {
    utils.addEnumMember(sc.OPTION_CATEGORY, 'MODS');

    for (let [index, level] of consoleM.LOG_LEVEL_NAMES.entries()) {
      let def: sc.OptionDefinition = {
        type: 'CHECKBOX',
        cat: sc.OPTION_CATEGORY.GENERAL,
        init: consoleM.DEFAULT_LOG_LEVELS[level],
        restart: true,
      };
      if (index === 0) {
        def.hasDivider = true;
        def.header = 'logLevel';
      }
      sc.OPTIONS_DEFINITION[LOG_LEVEL_OPTION_IDS[level]] = def;
    }

    sc.OPTIONS_DEFINITION['mods-description'] = {
      type: 'INFO',
      cat: sc.OPTION_CATEGORY.MODS,
      data: 'options.mods-description.description',
      marginBottom: 10,
    };

    for (let mod of INSTALLED_MODS) {
      let definition: sc.OptionDefinitionCommon & sc.OptionDefinition.CHECKBOX = {
        type: 'CHECKBOX',
        cat: sc.OPTION_CATEGORY.MODS,
        init: true,
        restart: true,
        checkboxRightAlign: true,
        mod,
      };

      sc.OPTIONS_DEFINITION[`${MOD_ENABLED_OPTION_ID_PREFIX}${mod.id}`] = definition;
    }

    const MODS_TAB_ID = 'mods' as const;
    sc.fontsystem.font.pushIconSet(
      new ig.Font('mod://ccloader-runtime/media/icons.png', 16, ig.MultiFont.ICON_START),
      { [MODS_TAB_ID]: 0 },
    );
    sc.OptionsTabBox.prototype.tabs[MODS_TAB_ID] = null!;
    sc.OptionsTabBox.inject({
      init(...args) {
        this.parent(...args);
        let btn = this._createTabButton(MODS_TAB_ID, this.tabArray.length, sc.OPTION_CATEGORY.MODS);
        this.tabs[MODS_TAB_ID] = btn;
        this._rearrangeTabs();
      },
    });

    const { modDataStorage } = modloader;

    sc.OptionModel.inject({
      onStorageGlobalLoad(globalsData, ...args) {
        let { options } = globalsData;
        if (options == null) {
          options = {} as ig.Storage.GlobalsData.Options;
          globalsData.options = options;
        }

        for (let key of Object.keys(options)) {
          if (key.startsWith(MOD_ENABLED_OPTION_ID_PREFIX)) {
            delete options[key];
          }
        }

        for (let { id } of INSTALLED_MODS) {
          options[`${MOD_ENABLED_OPTION_ID_PREFIX}${id}`] = modDataStorage.isModEnabled(id);
        }

        return this.parent(globalsData, ...args);
      },

      onStorageGlobalSave(globalsData, ...args) {
        let result = this.parent(globalsData, ...args);

        let { options } = globalsData;

        let logLevels = {} as consoleM.LogLevelsDict;
        for (let level of consoleM.LOG_LEVEL_NAMES) {
          logLevels[level] = options[LOG_LEVEL_OPTION_IDS[level]] as boolean;
        }
        consoleM.setLogLevels(logLevels);

        for (let { id } of INSTALLED_MODS) {
          let optionID = `${MOD_ENABLED_OPTION_ID_PREFIX}${id}`;
          modDataStorage.setModEnabled(id, Boolean(options[optionID]));
          delete options[optionID];
        }
        modDataStorage.write().catch((err) => {
          console.error('Failed to write mod data and settings:', err);
        });

        return result;
      },
    });

    const MOD_ICON_GUI_SIZE = 24;

    sc.OptionRow.inject({
      modIconGfx: null,
      modIconFallbackGfx: new ig.Image('media/gui/menu.png'),
      modIconPosX: 0,
      modIconPosY: 0,
      modVersionGui: null,

      init(...args) {
        this.parent(...args);

        if (this.option.mod != null) {
          let { mod } = this.option;

          let currentScale = ig.system.scale * ig.system.contextScale;
          // The loop will select the crispest icon for the current pixel size,
          // it kind of does mipmap selection. We don't pick the largest icon
          // resolution available because we don't get more pixels on the
          // canvas than the internal resolution times the current pixel size.
          for (let iconScale = currentScale; iconScale > 0; iconScale--) {
            let iconSize = iconScale * MOD_ICON_GUI_SIZE;
            if (currentScale % iconScale !== 0) continue;
            let iconPath: string | undefined = mod.manifest.icons?.[iconSize];
            if (iconPath == null) continue;
            this.modIconGfx = new ig.Image(`/${mod.resolvePath(iconPath)}`);
            break;
          }

          this.modIconPosX = this.nameGui.hook.pos.x;
          this.modIconPosY = this.lineGui.hook.pos.y + 2;
          this.nameGui.hook.pos.x += this.modIconPosX + MOD_ICON_GUI_SIZE;

          let modVersionStr = mod.version != null ? mod.version.toString() : '';
          if (/^[^v]/i.test(modVersionStr)) {
            modVersionStr = `v${modVersionStr}`;
          }
          this.modVersionGui = new sc.TextGui(modVersionStr, { font: sc.fontsystem.tinyFont });
          this.modVersionGui.setAlign(ig.GUI_ALIGN.X_LEFT, ig.GUI_ALIGN.Y_BOTTOM);
          this.modVersionGui.setPos(
            this.lineGui.hook.size.x - this.modVersionGui.hook.size.x + 1,
            this.lineGui.hook.pos.y + 1,
          );
          this.addChildGui(this.modVersionGui);
        }
      },

      updateDrawables(renderer) {
        this.parent(renderer);
        if (this.option.mod != null) {
          let iconGfx: ig.Image;
          let srcX = 0;
          let srcY = 0;
          let sizeX = 0;
          let sizeY = 0;
          let scaleX = 1;
          let scaleY = 1;
          if (this.modIconGfx?.loaded) {
            iconGfx = this.modIconGfx;
            sizeX = iconGfx.width;
            sizeY = iconGfx.height;
            scaleX = MOD_ICON_GUI_SIZE / iconGfx.width;
            scaleY = MOD_ICON_GUI_SIZE / iconGfx.height;
          } else {
            iconGfx = this.modIconFallbackGfx;
            // Coordinates were taken from `sc.QuickMenuAnalysisCursor#updateDrawables`
            srcX = 536;
            srcY = 160;
            sizeX = 23;
            sizeY = 23;
          }
          // Pretend that the icon is a child GUI element with X_LEFT and
          // Y_BOTTOM alignments.
          let iconX = this.modIconPosX / scaleX;
          let iconY = (this.hook.size.y - MOD_ICON_GUI_SIZE - this.modIconPosY) / scaleY;
          renderer.addTransform().setScale(scaleX, scaleY);
          renderer.addGfx(iconGfx, iconX, iconY, srcX, srcY, sizeX, sizeY);
          renderer.undoTransform();
        }
      },
    });
  });
