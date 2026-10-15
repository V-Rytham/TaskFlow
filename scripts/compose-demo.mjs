import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const directory = ".local/demo-recording";
const metadata = JSON.parse(
  await readFile(`${directory}/timeline.json`, "utf8"),
);
if (!metadata.success)
  throw new Error("Only a successfully verified recording can be composed.");
await mkdir("videos", { recursive: true });
await mkdir(`${directory}/captions`, { recursive: true });
await copyFile("C:/Windows/Fonts/segoeui.ttf", `${directory}/font.ttf`);
function probe(path) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration:format_tags=creation_time", "-of", "json", path],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  const format=JSON.parse(result.stdout).format;
  const createdAt=Date.parse(format.tags?.creation_time);
  if(!Number.isFinite(createdAt)) throw new Error('The browser recording has no capture timestamp.');
  return createdAt;
}
const duration = (metadata.endedAt - metadata.startedAt) / 1000;
const trims = metadata.videos.map((path) => Math.max(0,(metadata.startedAt-probe(path))/1000));
const font = `fontfile=${directory}/font.ttf`;
async function textFile(name, text) {
  const path = `${directory}/captions/${name}.txt`;
  await writeFile(path, text);
  return path;
}
const title = await textFile("title", "TaskFlow | Live collaboration demo");
const url = await textFile("url", metadata.baseURL);
const left = await textFile("left", "CHROME  |  Avery Morgan - Project Head");
const right = await textFile(
  "right",
  "MICROSOFT EDGE  |  Riley Chen - Assignee",
);
const filters = [
  `[0:v]trim=start=${trims[0].toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=960:900,setsar=1,tpad=stop_mode=clone:stop_duration=10[left]`,
  `[1:v]trim=start=${trims[1].toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=960:900,setsar=1,tpad=stop_mode=clone:stop_duration=10[right]`,
];
let overlay = `[left][right]hstack=inputs=2:shortest=1,pad=1920:1080:0:120:color=0x152b25,drawbox=x=959:y=120:w=2:h=900:color=0x247b64:t=fill`;
overlay += `,drawtext=${font}:textfile=${title}:x=24:y=14:fontsize=28:fontcolor=white`;
overlay += `,drawtext=${font}:textfile=${url}:x=24:y=52:fontsize=14:fontcolor=0xb9cfc5`;
overlay += `,drawtext=${font}:textfile=${left}:x=24:y=87:fontsize=18:fontcolor=white`;
overlay += `,drawtext=${font}:textfile=${right}:x=984:y=87:fontsize=18:fontcolor=white`;
function time(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
}
let subtitles = "";
for (let index = 0; index < metadata.stages.length; index++) {
  const stage = metadata.stages[index];
  const start = stage.start;
  const end = metadata.stages[index + 1]?.start ?? duration;
  const heading = await textFile(
    `stage-${index}-heading`,
    `${String(index + 1).padStart(2, "0")}  ${stage.title}`,
  );
  const caption = await textFile(`stage-${index}-caption`, stage.caption);
  const enable = `between(t,${start.toFixed(3)},${end.toFixed(3)})`;
  overlay += `,drawtext=${font}:textfile=${heading}:x=(w-text_w)/2:y=1028:fontsize=18:fontcolor=white:enable='${enable}'`;
  overlay += `,drawtext=${font}:textfile=${caption}:x=(w-text_w)/2:y=1054:fontsize=14:fontcolor=0xb9cfc5:enable='${enable}'`;
  subtitles += `${index + 1}\n${time(start)} --> ${time(end)}\n${stage.title}\n${stage.caption}\n\n`;
}
filters.push(`${overlay}[video]`);
const filterFile = resolve(`${directory}/compose-filter.txt`);
await writeFile(filterFile, filters.join(";\n"));
await writeFile("videos/taskflow-demo.srt", `${subtitles.trimEnd()}\n`);
console.log(
  `Encoding ${Math.round(duration)} seconds of synchronized browser footage.`,
);
const output = "videos/taskflow-demo.mp4";
const result = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-y",
    "-i",
    metadata.videos[0],
    "-i",
    metadata.videos[1],
    "-filter_complex",
    filters.join(";\n"),
    "-map",
    "[video]",
    "-t",
    duration.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const posterTime =
  metadata.stages.find(
    (stage) => stage.title === "Start work and sync the Project Head board",
  ).start + 7;
const poster = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-y",
    "-ss",
    posterTime.toFixed(2),
    "-i",
    output,
    "-frames:v",
    "1",
    "-update",
    "1",
    "videos/taskflow-demo-poster.jpg",
  ],
  { stdio: "inherit" },
);
if (poster.status !== 0) process.exit(poster.status ?? 1);
const chapters = metadata.stages
  .map((stage) => `${time(stage.start).slice(0, 8)}  ${stage.title}`)
  .join("\n");
await writeFile(
  "videos/taskflow-demo-chapters.txt",
  `TaskFlow live demo\n${metadata.baseURL}\n\n${chapters}\n\nVerified actions\n${metadata.checks.map((check) => `- ${check}`).join("\n")}\n`,
);
console.log(`MP4 ready: ${resolve(output)}`);
