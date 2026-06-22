# Weather display assets — credits

The weather mode reproduces the look of the **WeatherStar 4000**, the 1990s
Weather Channel local-forecast system.

## Presentation

- **WeatherStar 4000+** — <https://github.com/netbymatt/ws4kp> — © Matt Walsh,
  MIT License. The layout, screen cycle (Current Conditions / Extended Forecast
  / Almanac), color scheme, and current-conditions icon naming are modelled on
  this project. crt-tv uses **Open-Meteo** for data instead of ws4kp's US-only
  NWS API, so it works for any configured location.

## Fonts & icons (fetched by `fetch-assets.sh`, not committed)

- **Star4000 font set** and the **current-conditions weather icons** are
  TWCClassics assets (icons by Charles Abel, Nick Smith, and Malek Masoud),
  distributed via <https://twcclassics.com/downloads.html> and vendored in the
  ws4kp repository. They are downloaded at setup time into `fonts/` and
  `icons/` here and are intentionally git-ignored. Refer to TWCClassics for
  their terms of use.

## Background music (fetched by `fetch-audio.sh`, not committed)

- The weather-channel music is the smooth-jazz library used by the original
  Weather Channel WeatherStar 4000, sourced from the
  [vbguyny/ws4kp](https://github.com/vbguyny/ws4kp) `Audio/` folder. **This music
  is copyrighted by the respective artists and/or labels** (Trammell Starks,
  Brian Hughes, Chris Camozzi, and others). It is fetched at your discretion for
  **personal, non-commercial use only** and is intentionally git-ignored. Do not
  redistribute.

This project is a non-commercial hobby build and is not affiliated with or
endorsed by The Weather Channel.
