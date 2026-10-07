-- Run with lua tools/test/startup.lua from the repository root.
local now, width, removed, unpaused, draws = 0, 0, 0, 0, 0
local events, timer = {}, {}
function timer:kill() self.killed = true end
mp = {
    get_script_directory = function() return 'scripts/startup' end,
    get_time = function() return now end,
    create_osd_overlay = function()
        return {update=function(self)
            draws = draws + 1
            assert(self.data:find('FFFFFF', 1, true), 'logo stays lit')
        end, remove=function() removed = removed + 1 end}
    end,
    add_periodic_timer = function(_, fn) timer.tick = fn; return timer end,
    register_event = function(name, fn) events[name] = fn end,
    get_property_number = function() return width end,
    set_property_native = function(name, value)
        assert(name == 'pause' and value == false)
        unpaused = unpaused + 1
    end,
    msg = {info=function() end},
}
dofile('scripts/startup/main.lua')
local function tick(t) now=t; timer.tick() end
-- Readiness alone cannot skip the minimum.
width=720; events['playback-restart'](); tick(11.99)
assert(removed == 0 and unpaused == 0)
-- Failed/skipped first files keep animating indefinitely, even after a minute.
events['end-file'](); tick(80); tick(80.04)
assert(removed == 0 and unpaused == 0 and draws >= 4)
width=0; events['playback-restart'](); tick(81)
assert(removed == 0)
-- A decoded video ends loading once; later playlist entries never repeat it.
width=720; events['playback-restart'](); tick(81.04)
assert(removed == 1 and unpaused == 1 and timer.killed)
events['start-file'](); events['playback-restart'](); tick(100)
assert(removed == 1 and unpaused == 1)
print('native startup loader tests passed')
