import gc, json, math, os, re, sys
import UnityPy

rust = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Rust"
shared = os.path.join(rust, "Bundles", "shared")
out_dir = os.path.join(os.path.dirname(__file__), "..", "data")

KINDS = [
    ("recycler", re.compile(r"^recycler_static$", re.I)),
    ("research", re.compile(r"^researchtable_static$", re.I)),
    ("refinery", re.compile(r"^(small_refinery_static|refinery_small_static)$", re.I)),
    ("repair", re.compile(r"^repairbench_static$", re.I)),
    ("workbench", re.compile(r"^workbench[123]\.static$", re.I)),
    ("turret", re.compile(r"^sentry\.(scientist|bandit)\.static$", re.I)),
    ("sam", re.compile(r"^SAM_Static$", re.I)),
    ("pumpjack", re.compile(r"^pumpjack-static$", re.I)),
    ("card_green", re.compile(r"^GCD_.*CardReader$", re.I)),
    ("card_blue", re.compile(r"^BCD_.*CardReader$", re.I)),
    ("card_red", re.compile(r"^RCD_.*CardReader$", re.I)),
]

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz)

def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    ix = w*vx + y*vz - z*vy; iy = w*vy + z*vx - x*vz; iz = w*vz + x*vy - y*vx; iw = -x*vx - y*vy - z*vz
    return (ix*w + iw*-x + iy*-z - iz*-y, iy*w + iw*-y + iz*-x - ix*-z, iz*w + iw*-z + ix*-y - iy*-x)

env = UnityPy.load(os.path.join(shared, "content.bundle"))
ids = {}
spawns = {}
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        name = obj.peek_name()
    except Exception:
        continue
    if name == "manifest":
        t = obj.read_typetree()
        if "prefabProperties" in t:
            ids = {p["name"]: p["hash"] for p in t["prefabProperties"]}
    elif name in ("junkpiles", "junkpiles_water", "divesites"):
        t = obj.read_typetree()
        f = t["Filter"]
        spawns[name] = {"density": t["_targetDensity"], "biome": f["BiomeType"], "splat": f["SplatType"],
                        "topologyAny": f["TopologyAny"], "topologyAll": f["TopologyAll"], "topologyNot": f["TopologyNot"]}
del env
gc.collect()

MON_NAMES = [("launch_site", "Launch Site"), ("airfield", "Airfield"), ("military_tunnel", "Military Tunnel"), ("powerplant", "Power Plant"),
    ("trainyard", "Train Yard"), ("water_treatment_plant", "Water Treatment Plant"), ("excavator", "Giant Excavator"),
    ("nuclear_missile_silo", "Missile Silo"), ("bandit_town", "Bandit Camp"), ("compound", "Outpost"), ("junkyard", "Junkyard"),
    ("apartments_complex", "Apartment Complex"), ("radtown_small", "Abandoned Military Base"), ("radtown", "Radtown"),
    ("satellite_dish", "Satellite Dish"), ("sphere_tank", "The Dome"), ("mining_quarry_a", "Sulfur Quarry"),
    ("mining_quarry_b", "Stone Quarry"), ("mining_quarry_c", "HQM Quarry"), ("stables_a", "Ranch"), ("stables_b", "Large Barn"),
    ("lighthouse", "Lighthouse"), ("harbor", "Harbor"), ("ferry_terminal", "Ferry Terminal"), ("fishing_village", "Fishing Village"),
    ("oilrig_1", "Large Oil Rig"), ("oilrig_2", "Oil Rig"), ("underwater_lab", "Underwater Lab"),
    ("desert_military_base", "Abandoned Military Base"), ("arctic_research_base", "Arctic Research Base"),
    ("jungle_ziggurat", "Jungle Ziggurat"), ("jungle_ruins", "Jungle Ruins"), ("swamp", "Swamp"), ("water_well", "Water Well"),
    ("warehouse", "Warehouse"), ("gas_station", "Oxum's Gas Station"), ("supermarket", "Abandoned Supermarket"), ("cave", "Cave")]
MON_NAMES.sort(key=lambda kv: -len(kv[0]))
monuments = {}
for pth, h in ids.items():
    m = re.match(r"^assets/bundled/prefabs/autospawn/monument/[^/]+/([^/]+)\.prefab$", pth)
    if not m or re.match(r"^(ice_lake|.*pipe_access)", m.group(1)):
        continue
    raw = m.group(1)
    monuments[str(h)] = next((n for k, n in MON_NAMES if raw.startswith(k)), raw.replace("_", " "))
json.dump(monuments, open(os.path.join(out_dir, "monuments.json"), "w"), separators=(",", ":"))
print("monument names:", len(monuments))

env = UnityPy.load(os.path.join(shared, "assetscenes.bundle"))

def transform_of(go):
    for pair in go.m_Component:
        c = pair.component.deref()
        if c.type.name in ("Transform", "RectTransform"):
            return c.read()

facilities = {}
for obj in env.objects:
    if obj.type.name != "GameObject":
        continue
    path = obj.peek_name() or ""
    if "/autospawn/monument/" not in path or path not in ids:
        continue
    found = []
    stack = [(obj.read(), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0), (1.0, 1.0, 1.0), True)]
    while stack:
        go, pos, rot, scl, is_root = stack.pop()
        tr = transform_of(go)
        if not tr:
            continue
        if not is_root:
            lp = tr.m_LocalPosition; lr = tr.m_LocalRotation; ls = tr.m_LocalScale
            pos = tuple(p + d for p, d in zip(pos, qrot(rot, (lp.x * scl[0], lp.y * scl[1], lp.z * scl[2]))))
            rot = qmul(rot, (lr.x, lr.y, lr.z, lr.w))
            scl = (scl[0] * ls.x, scl[1] * ls.y, scl[2] * ls.z)
            name = re.sub(r" \(\d+\)$", "", go.m_Name)
            for kind, pat in KINDS:
                if pat.match(name):
                    found.append({"t": kind, "x": round(pos[0], 1), "y": round(pos[1], 1), "z": round(pos[2], 1)})
                    break
        for ch in tr.m_Children:
            cgo = ch.read().m_GameObject.read()
            stack.append((cgo, pos, rot, scl, False))
    if found:
        facilities[str(ids[path])] = {"path": path, "items": found}
        print(f"{len(found):4} facilities  {path.split('/monument/')[1]}", flush=True)

json.dump({"source": "Rust client bundles via scripts/extract-game-data.py", "monuments": facilities},
          open(os.path.join(out_dir, "facilities.json"), "w"), separators=(",", ":"))
json.dump({"source": "Rust client bundles via scripts/extract-game-data.py", "populations": spawns},
          open(os.path.join(out_dir, "spawns.json"), "w"), indent=1)
print("monuments with facilities:", len(facilities), "| spawn tables:", list(spawns))

del env
gc.collect()
env = UnityPy.load(os.path.join(shared, "items.preload.bundle"))
by_go = {}
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        t = obj.read_typetree()
    except Exception:
        continue
    go = t.get("m_GameObject", {}).get("m_PathID")
    if go is None:
        continue
    d = by_go.setdefault(go, {})
    if "itemid" in t and "shortname" in t:
        d["id"] = str(t["itemid"])
    if "amountToCreate" in t:
        d["amount"] = t["amountToCreate"]
yields = {d["id"]: d["amount"] for d in by_go.values() if d.get("amount", 1) > 1 and "id" in d}
json.dump(yields, open(os.path.join(out_dir, "craft-yields.json"), "w"), separators=(",", ":"))
print("recipes making more than one per craft:", len(yields), "(run `npm run build-data` to apply)")
