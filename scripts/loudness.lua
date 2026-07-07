-- Loudness normalization for crt-player's mpv.
-- The web remote's server analyzes every file once (EBU R128) into
-- MEDIA_DIR/.loudness.json; on each file start this applies a static gain
-- toward the target loudness, capped so the true peak keeps ~1 dB headroom.
-- Static gain preserves dynamics — no pumping, unlike live normalizers.
-- Files not yet analyzed play at unity until their analysis lands.
local utils = require("mp.utils")

local MEDIA_DIR = os.getenv("MEDIA_DIR") or "/srv/media"
local TARGET_LUFS = -16
local MAX_BOOST = 12 -- dB, mpv's default volume-gain ceiling
local MAX_CUT = -20 -- dB

local cache = nil
local cache_time = 0

local function loudness_map()
	local now = os.time()
	if cache and now - cache_time < 30 then
		return cache
	end
	cache = {}
	cache_time = now
	local f = io.open(MEDIA_DIR .. "/.loudness.json", "r")
	if f then
		local parsed = utils.parse_json(f:read("*a") or "")
		f:close()
		if type(parsed) == "table" then
			cache = parsed
		end
	end
	return cache
end

mp.register_event("file-loaded", function()
	local path = mp.get_property("path") or ""
	local gain = 0
	if path:sub(1, #MEDIA_DIR + 1) == MEDIA_DIR .. "/" then
		local rel = path:sub(#MEDIA_DIR + 2)
		local m = loudness_map()[rel]
		if m and type(m.i) == "number" then
			gain = TARGET_LUFS - m.i
			if type(m.tp) == "number" then
				gain = math.min(gain, -1 - m.tp) -- keep 1 dB true-peak headroom
			end
			gain = math.max(MAX_CUT, math.min(gain, MAX_BOOST))
		end
	end
	mp.set_property_number("volume-gain", gain)
end)
