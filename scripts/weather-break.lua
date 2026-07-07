-- Auto weather break for crt-player's mpv.
-- While /run/crt-tv/autobreak exists (toggled by `tv autobreak`), cut to the
-- weather after every N videos (N is the file's content, normally 5).
-- `tv break` saves the resume point and schedules the return; the player
-- restart resets our counter, which is exactly right — the next break comes
-- N videos after the resume.

local count = 0

local function autobreak_every()
	local f = io.open("/run/crt-tv/autobreak", "r")
	if not f then
		return nil
	end
	local n = tonumber(f:read("*l"))
	f:close()
	if n and n > 0 then
		return n
	end
	return 5
end

mp.register_event("file-loaded", function()
	count = count + 1
	local every = autobreak_every()
	if not every then
		return
	end
	-- count-1 videos have finished; break before the (N+1)th plays
	if count > 1 and (count - 1) % every == 0 then
		mp.command_native({
			name = "subprocess",
			args = { "/usr/local/bin/tv", "break" },
			playback_only = false,
			detach = true,
		})
	end
end)
