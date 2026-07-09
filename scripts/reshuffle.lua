-- Fresh shuffle on every pass of the channel: `tv play` bakes ONE shuffled
-- order into the playlist file and --loop-playlist=inf repeats it verbatim,
-- so the rotation played the exact same sequence forever. When the playlist
-- wraps (last entry -> first), re-shuffle it in place. Honors the shuffle
-- flag live, like commercials.lua does for its flag — toggling shuffle off
-- stops the re-rolls and the current order loops unchanged.
local function shuffle_on()
	local f = io.open("/run/crt-tv/shuffle", "r")
	if f then
		f:close()
		return true
	end
	return false
end

local last = nil

mp.observe_property("playlist-pos", "number", function(_, pos)
	if pos == nil then
		return
	end
	local count = mp.get_property_number("playlist-count") or 0
	if last ~= nil and pos == 0 and last == count - 1 and count > 2 and shuffle_on() then
		-- the playing entry moves with the shuffle; playback isn't interrupted.
		-- A pending commercial may get scattered — commercials.lua prunes and
		-- re-picks on the next file-loaded, so the cadence self-heals.
		mp.command("playlist-shuffle")
		mp.msg.info("playlist wrapped — reshuffled for a fresh pass")
	end
	last = pos
end)
