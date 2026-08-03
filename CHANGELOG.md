# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2024-05-07

### Changed

-   Tweak Next fruit UI element to make it stand out more (22e2512)

### Fixed

-   Fruit dropped before first fruit is determined throws error due to underlying Matter physics body receiving invalid radius (dfe5ce6)
-   "Touch to place fruit" dialog not disappearing from HUD if player drops fruit immediately upon game load (db0284e)

## [0.1.0] - 2023-11-30

### Changed

-   Switch physics from Phaser Arcade to Matter (0c0030d)

## [0.0.5] - 2023-10-31

### Added

-   Directional movement control scheme (29b9af7)

## [0.0.4] - 2023-10-21

### Fixed

-   Broken link for fruit hierarchy image (0a15d02)

## [0.0.3] - 2023-10-21

### Added

-   Fruit hierarchy image to How to Play dialog (cbb55d3)

### Changed

-   Bring up how to play when playing for the first time (d2778e0)
-   Make top menu bar overlay on top of game, adjust game dimensions (e8a1539)
-   Switch dialog background to a light colour and game text/buttons to black to accommodate for fruit hierarchy image (cbb55d3)

## [0.0.2] - 2023-10-14

### Added

-   Link to releases page on GitHub to version number element in settings page (3f2f2f8)

### Changed

-   Make top bar invisible and have it pulsate when fruit gets close (13c9b59)
-   Update webpack to v5 (95a1874)

## [0.0.1] - 2023-10-09

Initial Release

[unreleased]: https://github.com/Coteh/suika-clone/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Coteh/suika-clone/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Coteh/suika-clone/compare/v0.0.5...v0.1.0
[0.0.5]: https://github.com/Coteh/suika-clone/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/Coteh/suika-clone/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/Coteh/suika-clone/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/Coteh/suika-clone/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/Coteh/suika-clone/releases/tag/v0.0.1
