-- mpv resets file-local options when advancing to the next playlist entry.
local seconds = tonumber(os.getenv("CRT_RESUME_SECONDS"))
mp.add_hook("on_load", 50, function()
    if seconds and seconds > 0 then
        mp.set_property("file-local-options/start", tostring(seconds))
    end
    seconds = nil
end)
