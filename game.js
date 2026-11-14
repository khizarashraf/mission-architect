// ===================================================================
//  MISSION ARCHITECT - the brain of the game
//  Plan: (1) data  (2) page setup  (3) the math  (4) draw the screen
//        (5) team mode  (6) launch  (7) welcome pop-up and start
// ===================================================================


// ---------- 1. THE DATA ----------
// All the numbers live here. Want to rebalance the game? Edit these lists.
// (Simplified, invented numbers. Not real NASA data.)

// Difficulty levels: budget = money we can spend, eventChance = chance of space weather
const levels = {
  easy:   { budget: 180, eventChance: 0 },
  normal: { budget: 150, eventChance: 0.4 },
  hard:   { budget: 130, eventChance: 0.7 }
};

const BODY = { cost: 10, mass: 50 };   // the basic spacecraft body is always included

// "sun" = sunlight strength there (1 = full). "signal" = how well radio reaches Earth.
const destinations = [
  { id: "Moon",   name: "The Moon", sun: 1.0, signal: 1.0,
    info: "About 3 days away. Lots of sunlight and an easy radio link." },
  { id: "Mars",   name: "Mars",     sun: 0.6, signal: 0.7,
    info: "About 6 to 9 months away. Weaker sunlight and a slower radio link." },
  { id: "Europa", name: "Europa, a moon of Jupiter", sun: 0.2, signal: 0.5,
    info: "Years away. Sunlight is very weak, so solar panels struggle." }
];

// Launch segment. "reaches" = where the rocket can go. "maxMass" = payload capacity.
const rockets = [
  { id: "small",  name: "Small rocket",  cost: 20, maxMass: 120, reaches: ["Moon"] },
  { id: "medium", name: "Medium rocket", cost: 35, maxMass: 250, reaches: ["Moon", "Mars"] },
  { id: "heavy",  name: "Heavy rocket",  cost: 55, maxMass: 500, reaches: ["Moon", "Mars", "Europa"] }
];

// Power. "watts" = power made. "usesSun" = does sunlight strength matter?
const powerSystems = [
  { id: "smallPanels", icon: "☀️", name: "Small solar panels", cost: 10, mass: 20, watts: 40,  usesSun: true },
  { id: "bigPanels",   icon: "☀️", name: "Large solar panels", cost: 20, mass: 40, watts: 80,  usesSun: true },
  { id: "nuclear",     icon: "☢️", name: "Nuclear battery",    cost: 35, mass: 80, watts: 120, usesSun: false }
];

// Ground segment. "rate" = how much data it can send home.
const antennas = [
  { id: "smallAnt", icon: "📡", name: "Small antenna", cost: 5,  mass: 10, rate: 20 },
  { id: "bigAnt",   icon: "📡", name: "Large antenna", cost: 15, mass: 30, rate: 50 }
];

// Science instruments. "science" = points earned.
const instruments = [
  { id: "camera", icon: "📷", name: "Camera",       cost: 10, mass: 20, power: 15, data: 8,  science: 10 },
  { id: "mag",    icon: "🧲", name: "Magnetometer", cost: 8,  mass: 10, power: 5,  data: 3,  science: 8 },
  { id: "spec",   icon: "🔬", name: "Spectrometer", cost: 20, mass: 40, power: 30, data: 15, science: 25 },
  { id: "radar",  icon: "🌀", name: "Radar",        cost: 25, mass: 60, power: 45, data: 25, science: 35 }
];

// ADVANCED FEATURE 1: random space weather. Warned in advance, so players can plan.
const events = [
  { id: "storm",    text: "A solar storm is coming. Solar panels will lose 40% of their power. Nuclear batteries are safe." },
  { id: "blackout", text: "Radio interference is coming. Your antenna will send 30% less data." }
];

// ADVANCED FEATURE 2: team mode. Each role "owns" some parts of the design.
// (Real mission teams also split the work between specialists.)
const roleSets = {
  1: [{ name: "Mission commander", owns: ["director", "engineer", "science"], launches: true }],
  2: [{ name: "Director and engineer", owns: ["director", "engineer"] },
      { name: "Science lead", owns: ["science"], launches: true }],
  3: [{ name: "Mission director", owns: ["director"] },
      { name: "Power and comms engineer", owns: ["engineer"] },
      { name: "Science lead", owns: ["science"], launches: true }],
  4: [{ name: "Mission director", owns: ["director"] },
      { name: "Power and comms engineer", owns: ["engineer"] },
      { name: "Science lead", owns: ["science"] },
      { name: "Flight controller", owns: [], launches: true }]
};
const ownerNames = { director: "mission director", engineer: "power and comms engineer", science: "science lead" };


// ---------- 2. GAME STATE AND PAGE ELEMENTS ----------
let BUDGET = 150;      // changes with difficulty
let players = 1;       // 1 to 4
let activeIdx = 0;     // whose turn it is in team mode
let event = null;      // today's space weather (or null)
let lastDest = "";     // remembers the last planet shown
let shownParts = new Set();   // remembers parts already in the bay (so only new ones pop in)

const $ = (id) => document.getElementById(id);   // short nickname for "find by id"
const destSelect = $("destination"), rocketSelect = $("rocket"),
      powerSelect = $("power"), antennaSelect = $("antenna");

const findById = (list, id) => list.find((item) => item.id === id);
const currentRoles = () => roleSets[players];


// ---------- 3. FILL THE CHOICES ----------
function fillDropdown(select, items) {
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
}
fillDropdown(destSelect, destinations);
fillDropdown(rocketSelect, rockets);
fillDropdown(powerSelect, powerSystems);
fillDropdown(antennaSelect, antennas);

instruments.forEach((inst) => {
  const label = document.createElement("label");
  label.className = "instrument";
  label.innerHTML =
    `<input type="checkbox" value="${inst.id}"> ${inst.icon} ${inst.name}` +
    `<small>cost ${inst.cost} | weight ${inst.mass} | power ${inst.power} | ` +
    `data ${inst.data} | science ${inst.science}</small>`;
  $("instrumentList").appendChild(label);
});


// ---------- 4. THE MATH ----------
// Reads the player's choices and works out every number. It does NOT touch the screen.
function calculateDesign() {
  const dest    = findById(destinations, destSelect.value);
  const rocket  = findById(rockets, rocketSelect.value);
  const power   = findById(powerSystems, powerSelect.value);
  const antenna = findById(antennas, antennaSelect.value);
  const chosen  = [...document.querySelectorAll("#instrumentList input:checked")]
    .map((box) => findById(instruments, box.value));

  const sum = (key) => chosen.reduce((total, inst) => total + inst[key], 0);

  const cost = BODY.cost + rocket.cost + power.cost + antenna.cost + sum("cost");
  const mass = BODY.mass + power.mass + antenna.mass + sum("mass");

  // Solar panels make less power far from the Sun. Nuclear doesn't care.
  let powerMade = power.usesSun ? Math.round(power.watts * dest.sun) : power.watts;
  let dataCanSend = Math.round(antenna.rate * dest.signal);

  // Space weather makes things worse
  if (event && event.id === "storm" && power.usesSun) powerMade = Math.round(powerMade * 0.6);
  if (event && event.id === "blackout") dataCanSend = Math.round(dataCanSend * 0.7);

  const powerUsed = sum("power");
  const dataMade  = sum("data");
  const science   = sum("science");

  // ----- The rules. Each broken rule adds a lesson to "problems" -----
  // owner = which team role should fix it (used in team mode)
  const problems = [];
  const add = (owner, text) => problems.push({ owner, text });

  if (chosen.length === 0) {
    add("science", "You have no instruments, so there is nothing to study. Tick at least one.");
  }
  if (!rocket.reaches.includes(dest.id)) {
    add("director", `The ${rocket.name.toLowerCase()} is not powerful enough to reach ${dest.name}. Pick a bigger rocket.`);
  }
  if (mass > rocket.maxMass) {
    add("director", `Your spacecraft weighs ${mass} but this rocket can only lift ${rocket.maxMass}. That limit is called payload capacity. Use a bigger rocket or remove something heavy.`);
  }
  if (cost > BUDGET) {
    add("director", `You spent ${cost} but the budget is ${BUDGET}. Drop something expensive.`);
  }
  if (powerUsed > powerMade) {
    add("engineer", `Your instruments need ${powerUsed} power but you only make ${powerMade} there, so they would shut down. Try stronger power or fewer instruments.`);
  }
  if (dataMade > dataCanSend) {
    add("engineer", `Your instruments make ${dataMade} data but the antenna can only send ${dataCanSend} from there. The rest is lost. That limit is the data rate. Get a bigger antenna or fewer instruments.`);
  }

  // Bonus: 1 point for every 5 budget left over
  const bonus = cost <= BUDGET ? Math.floor((BUDGET - cost) / 5) : 0;

  return { dest, rocket, power, antenna, chosen, cost, mass, powerMade, powerUsed,
           dataCanSend, dataMade, science, bonus, problems };
}


// ---------- 5. DRAW THE SCREEN ----------
function setBar(name, used, limit) {
  $(name + "Fill").style.width = Math.min(100, (used / limit) * 100) + "%";
  $(name + "Fill").classList.toggle("over", used > limit);
  $(name + "Text").textContent = `${used} / ${limit}`;
}

// Show the chosen planet. Europa also shows giant Jupiter behind it.
function drawPlanet(dest) {
  if (dest.id === lastDest) return;
  lastDest = dest.id;
  $("destGlobe").className = "globe " + dest.id.toLowerCase();
  $("jupiter").hidden = dest.id !== "Europa";
  $("planetLabel").textContent = dest.name;
}

// Show every part in the bay. New parts "pop" in.
function drawBay(d) {
  const parts = [
    { id: "body", icon: "🛰️", name: "Spacecraft body" },
    { id: d.power.id, icon: d.power.icon, name: d.power.name },
    { id: d.antenna.id, icon: d.antenna.icon, name: d.antenna.name },
    ...d.chosen
  ];
  let html = parts.map((p) =>
    `<div class="chip ${shownParts.has(p.id) ? "" : "pop"}"><span>${p.icon}</span>${p.name}</div>`).join("");
  if (d.chosen.length === 0) {
    html += `<div class="chip empty">Tick an instrument to mount it here</div>`;
  }
  $("bayItems").innerHTML = html;
  shownParts = new Set(parts.map((p) => p.id));
}

function drawForecast() {
  $("forecast").textContent = event
    ? "Space weather forecast: " + event.text
    : (BUDGET === levels.easy.budget ? "Easy mode: no space weather." : "Space weather forecast: clear skies.");
  $("forecast").classList.toggle("warn", !!event);
}

// Runs every time the player changes anything
function updateScreen() {
  const d = calculateDesign();

  drawPlanet(d.dest);
  drawBay(d);
  drawForecast();

  $("destInfo").textContent    = d.dest.info;
  $("rocketInfo").textContent  = `Cost ${d.rocket.cost} | lifts up to ${d.rocket.maxMass} | goes to: ${d.rocket.reaches.join(", ")}`;
  $("powerInfo").textContent   = `Cost ${d.power.cost} | weight ${d.power.mass} | makes ${d.powerMade} power there`;
  $("antennaInfo").textContent = `Cost ${d.antenna.cost} | weight ${d.antenna.mass} | sends ${d.dataCanSend} data from there`;

  setBar("budget", d.cost, BUDGET);
  setBar("mass", d.mass, d.rocket.maxMass);
  setBar("power", d.powerUsed, d.powerMade);
  setBar("data", d.dataMade, d.dataCanSend);

  // Commander Zara reacts live. In team mode she says WHO should fix it.
  if (d.problems.length > 0) {
    const p = d.problems[0];
    const who = players > 1 ? ` Talk to your ${ownerNames[p.owner]}.` : "";
    $("commanderSays").textContent = "Hmm, careful. " + p.text + who;
  } else {
    $("commanderSays").textContent = "This looks ready to fly. Press launch when you are ready!";
  }
}


// ---------- 6. TEAM MODE (pass the computer around) ----------
function buildTeamBar() {
  const bar = $("teamBar");
  bar.hidden = players === 1;
  bar.innerHTML = currentRoles().map((role, i) =>
    `<button data-i="${i}" class="${i === activeIdx ? "active" : ""}">Player ${i + 1}: ${role.name}</button>`).join("");
}

// Lock every part of the design that the active player does not own
function applyRoles() {
  const role = currentRoles()[activeIdx];
  document.querySelectorAll("[data-owner]").forEach((box) => {
    const mine = role.owns.includes(box.dataset.owner);
    box.classList.toggle("locked", !mine);
    box.querySelectorAll("select, input").forEach((el) => (el.disabled = !mine));
  });
  $("launchBtn").disabled = !role.launches;
  $("launchBtn").textContent = role.launches ? "Launch mission" : "Only the launcher can press this";
}

$("teamBar").addEventListener("click", (e) => {
  if (!e.target.dataset.i) return;
  activeIdx = Number(e.target.dataset.i);
  buildTeamBar();
  applyRoles();
});


// ---------- 7. LAUNCH! ----------
function launch() {
  const d = calculateDesign();
  const rocketIcon = $("rocketIcon");
  const success = d.problems.length === 0;

  rocketIcon.classList.add(success ? "fly" : "crash");
  if (!success) setTimeout(() => (rocketIcon.textContent = "💥"), 2200);

  const result = $("result");
  result.hidden = false;
  result.className = "result " + (success ? "win" : "lose");

  if (success) {
    const total = d.science + d.bonus;
    const rating = total >= 60 ? "Outstanding engineering!"
                 : total >= 30 ? "A solid mission."
                 : "A modest start. Try adding more science next time.";
    result.innerHTML =
      `<h3>Mission success! You reached ${d.dest.name}.</h3>` +
      `<p>Science points: <b>${d.science}</b> + savings bonus <b>${d.bonus}</b> = <b>${total}</b>. ${rating}</p>` +
      `<p>Real engineers also trade cost, weight, power and data against each other. There is rarely one perfect design.</p>`;
    $("commanderSays").textContent = "Liftoff! Everything held together. Great teamwork!";
  } else {
    result.innerHTML = `<h3>Mission failed</h3><p>Here is why:</p><ul>` +
      d.problems.map((p) => `<li>${p.text}</li>`).join("") + `</ul>`;
    $("commanderSays").textContent = "That did not go well, but engineers learn from every failure. Adjust and try again!";
  }

  $("launchBtn").hidden = true;
  $("resetBtn").hidden = false;
}

// Back to the design screen with a fresh space-weather roll
function designAgain() {
  const rocketIcon = $("rocketIcon");
  rocketIcon.className = "rocket noanim";     // jump back to Earth with no animation
  rocketIcon.textContent = "🚀";
  void rocketIcon.offsetWidth;                // (forces the browser to apply that jump now)
  rocketIcon.className = "rocket";

  event = Math.random() < levels[currentLevel()].eventChance
    ? events[Math.floor(Math.random() * events.length)] : null;

  $("result").hidden = true;
  $("launchBtn").hidden = false;
  $("resetBtn").hidden = true;
  applyRoles();
  updateScreen();
}


// ---------- 8. WELCOME POP-UP AND START ----------
const slides = [...document.querySelectorAll("#intro .slide")];
let slideNo = 0;
const currentLevel = () => document.querySelector("input[name=level]:checked").value;

function showSlide(n) {
  slideNo = n;
  slides.forEach((s, i) => (s.hidden = i !== n));
  $("backBtn").style.visibility = n === 0 ? "hidden" : "visible";
  $("nextBtn").textContent = n === slides.length - 1 ? "Start mission" : "Next";
}

function startGame() {
  players = Number(document.querySelector("input[name=players]:checked").value);
  BUDGET = levels[currentLevel()].budget;
  activeIdx = 0;
  $("intro").close();
  buildTeamBar();
  designAgain();      // sets up the screen and rolls space weather
}

$("nextBtn").addEventListener("click", () =>
  slideNo === slides.length - 1 ? startGame() : showSlide(slideNo + 1));
$("backBtn").addEventListener("click", () => showSlide(slideNo - 1));
$("helpBtn").addEventListener("click", () => { showSlide(0); $("intro").showModal(); });

// Any change to a dropdown or checkbox redraws the screen
document.querySelector("main").addEventListener("change", updateScreen);
$("launchBtn").addEventListener("click", launch);
$("resetBtn").addEventListener("click", designAgain);

// When the page opens: draw once, then show the welcome pop-up
updateScreen();
showSlide(0);
$("intro").showModal();
