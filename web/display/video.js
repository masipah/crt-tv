// Continuous video playlist. Fetches /api/playlist and plays through it on a
// loop. The output signal is 480i (composite NTSC); source files should be
// progressive 4:3 (or 16:9 letterboxed) for best results on the PVM.

let playlist = [];
let index = 0;

function show(el, on) {
  el.hidden = !on;
}

async function fetchPlaylist() {
  const resp = await fetch("/api/playlist");
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.videos || [];
}

function playAt(player, i) {
  if (playlist.length === 0) return;
  index = ((i % playlist.length) + playlist.length) % playlist.length;
  player.src = playlist[index].url;
  player.play().catch((err) => console.warn("autoplay blocked / play error", err));
}

export async function startVideo(videoSection, startIndex = 0) {
  const player = videoSection.querySelector("#player");
  const empty = videoSection.querySelector("#video-empty");

  try {
    playlist = await fetchPlaylist();
  } catch (err) {
    console.error("playlist fetch failed", err);
    playlist = [];
  }

  if (playlist.length === 0) {
    show(empty, true);
    empty.textContent = "NO VIDEOS — ADD FILES TO media/";
    return;
  }
  show(empty, false);

  // advance to the next clip when one finishes; loop the whole list
  player.onended = () => playAt(player, index + 1);
  player.onerror = () => {
    console.warn("video error, skipping", playlist[index]);
    playAt(player, index + 1);
  };

  playAt(player, startIndex);
}

export function stopVideo(videoSection) {
  const player = videoSection.querySelector("#player");
  player.onended = null;
  player.onerror = null;
  player.pause();
  player.removeAttribute("src");
  player.load();
}
