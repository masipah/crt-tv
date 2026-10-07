-- Boot only: keep the station loader in the same window as the first video.
-- The launcher pauses decoding at the first frame, so no opening audio is lost.
local frames = dofile(mp.get_script_directory() .. "/frames.lua")
local minimum = tonumber(os.getenv("CRT_SPLASH_MIN_SECONDS")) or 12
minimum = math.max(0, math.min(60, minimum))
local started = mp.get_time()
local ready, finished = false, false
local overlay = mp.create_osd_overlay("ass-events")
overlay.res_x, overlay.res_y, overlay.z = 720, 480, 1000
local timer

local function draw()
    if finished then return end
    local elapsed = mp.get_time() - started
    if ready and elapsed >= minimum then
        finished = true
        timer:kill()
        mp.set_property_native("pause", false)
        overlay:remove()
        mp.msg.info("startup loader: first video ready, starting Channel")
        return
    end
    overlay.data = frames[math.floor(elapsed / 0.04) % #frames + 1]
    overlay:update()
end

-- file-loaded is too early: wait for playback-restart after the first decoded
-- frame reaches the video output, even while playback is paused.
mp.register_event("start-file", function() ready = false end)
mp.register_event("end-file", function() ready = false end)
mp.register_event("playback-restart", function()
    ready = (mp.get_property_number("dwidth", 0) > 0)
end)
timer = mp.add_periodic_timer(0.04, draw)
draw()
mp.register_event("shutdown", function() timer:kill(); overlay:remove() end)
