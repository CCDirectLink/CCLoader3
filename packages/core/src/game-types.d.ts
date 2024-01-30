/* eslint-disable @typescript-eslint/explicit-member-accessibility */

export {};

declare global {
  namespace ig {
    function _DOMReady(): void;

    class System {
      delegate: Game;

      setDelegate(delegate: ig.Game): void;
    }

    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class Game {}

    let system: ig.System;
  }

  function startCrossCode(): void;
}
