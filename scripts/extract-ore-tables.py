# Refresh data/ores.json from your own Rust install after a game update.
# Reads asset data only (no game code, nothing modified). Needs: pip install UnityPy
#   python scripts/extract-ore-tables.py "C:\Program Files (x86)\Steam\steamapps\common\Rust"
import json, os, sys
import UnityPy

rust = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Rust"
shared = os.path.join(rust, "Bundles", "shared")

# 1. Which populations the procedural spawn handler uses, and each ore folder's prefab weights.
env = UnityPy.load(os.path.join(shared, "assetscenes.bundle"))
handler_ids, weights = [], {}
for obj in env.objects:
    if obj.type.name != "MonoBehaviour":
        continue
    try:
        data = obj.read()
        cls = data.m_Script.read().m_ClassName
        owner = data.m_GameObject.read().m_Name
    except Exception:
        continue
    if cls == "SpawnHandler" and owner.endswith("spawn.procmap.v3.prefab"):
        handler_ids = [p["m_PathID"] for p in obj.read_typetree()["SpawnPopulations"]]
    if cls in ("PrefabParameters", "PrefabWeight") and "/autospawn/resource/ore" in owner:
        folder, prefab = owner.split("/resource/")[1].split("/")
        kind = prefab.split("-")[0].lower()
        t = obj.read_typetree()
        w = weights.setdefault(folder, {})
        if cls == "PrefabParameters":
            w[kind] = t["Count"]
        elif t.get("Era") == 0:  # Era 10 = Primitive mode only
            w[kind] = w.get(kind, 1) * t["Scale"]
del env

# 2. Population filters + densities from content.bundle.
env = UnityPy.load(os.path.join(shared, "content.bundle"))
pops = {}
for obj in env.objects:
    if obj.path_id not in handler_ids or obj.type.name != "MonoBehaviour":
        continue
    t = obj.read_typetree()
    folder = t.get("ResourceFolder", "")
    if not folder.startswith("resource/ore"):
        continue
    f = t["Filter"]
    pops[t["m_Name"]] = {"folder": folder.split("/")[1], "density": t["_targetDensity"], "biome": f["BiomeType"], "splat": f["SplatType"],
                         "topologyAny": f["TopologyAny"], "topologyAll": f["TopologyAll"], "topologyNot": f["TopologyNot"]}

folders = {}
for p in pops.values():
    base = {"hqm": 1} if p["folder"] == "ore_hqm" else {"stone": 1, "metal": 1, "sulfur": 1}
    folders[p["folder"]] = {k: weights.get(p["folder"], {}).get(k, v) for k, v in base.items()}
print(json.dumps({"populations": pops, "folders": folders}, indent=1))
