-- Track metadata for the OwnTone AirPlay bridge.
-- On every file start, writes shairport-style metadata items (artist/title
-- parsed from "Artist - Title.ext" filenames) to OwnTone's metadata pipe,
-- which forwards them to the AirPlay receiver's display. The pipe write is
-- detached and timeout-guarded: FIFO opens block until OwnTone is reading,
-- and it only reads while the bridge output is engaged.
local PIPE = "/srv/owntone-pipe/CRT-TV.metadata"

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function b64(data)
	local out = {}
	for i = 1, #data, 3 do
		local b1, b2, b3 = data:byte(i, i + 2)
		local n = b1 * 65536 + (b2 or 0) * 256 + (b3 or 0)
		local c1 = math.floor(n / 262144) % 64
		local c2 = math.floor(n / 4096) % 64
		local c3 = math.floor(n / 64) % 64
		local c4 = n % 64
		out[#out + 1] = B64:sub(c1 + 1, c1 + 1)
			.. B64:sub(c2 + 1, c2 + 1)
			.. (b2 and B64:sub(c3 + 1, c3 + 1) or "=")
			.. (b3 and B64:sub(c4 + 1, c4 + 1) or "=")
	end
	return table.concat(out)
end

local function hex(s)
	return (s:gsub(".", function(c)
		return string.format("%02x", c:byte())
	end))
end

local function item(typ, code, payload)
	payload = payload or ""
	local s = string.format(
		"<item><type>%s</type><code>%s</code><length>%d</length></item>\n",
		hex(typ), hex(code), #payload)
	if #payload > 0 then
		s = s .. '<data encoding="base64">\n' .. b64(payload) .. "\n</data>\n"
	end
	return s
end

mp.register_event("file-loaded", function()
	local path = mp.get_property("path") or ""
	local name = path:match("([^/]+)$") or path
	name = name:gsub("%.%w+$", "")
	local artist, title = name:match("^(.-)%s+%-%s+(.+)$")
	if not title then
		artist, title = "CRT-TV", name
	end
	local blob = item("ssnc", "mdst")
		.. item("core", "asar", artist)
		.. item("core", "minm", title)
		.. item("core", "asal", "CRT-TV")
		.. item("ssnc", "mden")
	local tmp = os.tmpname()
	local f = io.open(tmp, "w")
	if not f then
		return
	end
	f:write(blob)
	f:close()
	mp.command_native({
		name = "subprocess",
		detach = true,
		playback_only = false,
		args = { "sh", "-c",
			"timeout 3 cat '" .. tmp .. "' > '" .. PIPE .. "' 2>/dev/null; rm -f '" .. tmp .. "'" },
	})
end)
