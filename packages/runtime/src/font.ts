ig.module('ccloader-runtime.stdlib.font')
  .requires('impact.base.font', 'game.feature.font.font-system')
  .defines(() => {
    function setSimpleMapping(
      multiFont: ig.MultiFont,
      iconSetIndex: number,
      simpleMapping: ig.MultiFont.MappingSimple,
    ): void {
      let regularMapping: ig.MultiFont.Mapping = {};
      for (let [iconName, index] of Object.entries(simpleMapping)) {
        regularMapping[iconName] = [iconSetIndex, index];
      }
      multiFont.setMapping(regularMapping);
    }

    ig.MultiFont.inject({
      pushIconSet(font, mapping?: ig.MultiFont.MappingSimple | null) {
        let iconSetIndex = this.iconSets.length;
        let result = this.parent(font);
        if (mapping != null) setSimpleMapping(this, iconSetIndex, mapping);
        return result;
      },

      setIconSet(font, index, mapping?: ig.MultiFont.MappingSimple | null) {
        let result = this.parent(font, index);
        if (mapping != null) setSimpleMapping(this, index, mapping);
        return result;
      },
    });
  });
