-- Commercial rotation for crt-player's mpv: after every 4th regular video,
-- pick a random file from the commercials bucket and insert it next in the
-- playlist. Played commercials are pruned afterwards so the looping video
-- rotation stays clean. An empty commercials bucket means plain rotation.
local utils = require("mp.utils")

local MEDIA_DIR = os.getenv("MEDIA_DIR") or "/srv/media"
local COMMERCIALS = MEDIA_DIR .. "/commercials"
local EVERY = 4

local EXTS = {
	mp4 = true, mkv = true, avi = true, mov = true, m4v = true,
	mpg = true, mpeg = true, ts = true, webm = true,
}

math.randomseed(os.time())

local function is_commercial(p)
	return p ~= nil and p:sub(1, #COMMERCIALS + 1) == COMMERCIALS .. "/"
end

local function pick_commercial()
	local files = utils.readdir(COMMERCIALS, "files")
	if not files then
		return nil
	end
	local vids = {}
	for _, f in ipairs(files) do
		local ext = f:match("%.([^.]+)$")
		if ext and EXTS[ext:lower()] then
			vids[#vids + 1] = COMMERCIALS .. "/" .. f
		end
	end
	if #vids == 0 then
		return nil
	end
	return vids[math.random(#vids)]
end

local count = 0

mp.register_event("file-loaded", function()
	-- prune played commercials so --loop-playlist never replays them; keep
	-- only the one currently playing and a pending one right after us
	-- (covers the wrap-around case where a commercial sits at the end)
	local pos = mp.get_property_number("playlist-pos", -1)
	local pl = mp.get_property_native("playlist") or {}
	for i = #pl, 1, -1 do
		local idx = i - 1
		if is_commercial(pl[i].filename) and idx ~= pos and idx ~= pos + 1 then
			mp.commandv("playlist-remove", tostring(idx))
		end
	end

	if is_commercial(mp.get_property("path")) then
		return -- commercials don't advance the video count
	end
	count = count + 1
	if count % EVERY == 0 then
		local c = pick_commercial()
		if c then
			mp.commandv("loadfile", c, "insert-next")
		end
	end
end)
