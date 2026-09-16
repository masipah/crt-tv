-- Poll only a tiny RAM file. AirPlay failure/stop removes it, returning mpv to
-- the jack without restarting the video. This also covers starts and skips.
local utils = require 'mp.utils'
local route_path = '/run/crt-tv/airplay.json'
local local_device = 'alsa/plughw:CARD=Headphones,DEV=0'
local remote_device = 'alsa/plughw:CARD=Loopback,DEV=0,SUBDEV=0'
local last = nil
local function update()
  local f = io.open(route_path, 'r')
  local route = nil
  if f then
    route = utils.parse_json(f:read('*a'))
    f:close()
  end
  local device = route and remote_device or local_device
  if device ~= last then
    mp.set_property('audio-device', device)
    mp.set_property_number('audio-delay', route and -math.max(0, math.min(5, tonumber(route.delay) or 2)) or 0)
    last = device
  end
  -- The existing hardware mute cannot mute the loopback; mirror its intent
  -- in mpv only while casting. File loudness normalization remains unchanged.
  local muted = io.open('/run/crt-tv/muted', 'r')
  mp.set_property_bool('mute', route ~= nil and muted ~= nil)
  if muted then muted:close() end
end
mp.register_event('file-loaded', function() last = nil; update() end)
mp.add_periodic_timer(0.5, update)
update()
