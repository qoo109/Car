#!/usr/bin/env python3
"""Import verified Free threejsassets.com models for Car V9.1.

The download endpoint may return either a raw GLB or a ZIP package. Raw downloaded
files exist only in the CI workspace; the shipped game receives embedded data URIs.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import io
import json
import re
import struct
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED_DIR = ROOT / "js" / "generated"
DOCS_DIR = ROOT / "docs"
IMPORT_REVISION = "2026-07-22-v91-zip1"
LICENSE_URL = "https://threejsassets.com/license"
LICENSE_NAME = "Free Commercial License"

ASSETS = [
    {
        "key": "carSedan",
        "slug": "car-sedan-01",
        "name": "Car Sedan 01",
        "category": "Vehicles",
        "source": "https://threejsassets.com/assets/car-sedan-01",
        "download": "https://threejsassets.com/download/free/car-sedan-01",
    },
    {
        "key": "taxi",
        "slug": "taxi-01",
        "name": "Taxi 01",
        "category": "Vehicles",
        "source": "https://threejsassets.com/assets/taxi-01",
        "download": "https://threejsassets.com/download/free/taxi-01",
    },
    {
        "key": "daySkyDome",
        "slug": "day-sky-dome",
        "name": "Day Sky Dome",
        "category": "Sky",
        "source": "https://threejsassets.com/assets/day-sky-dome",
        "download": "https://threejsassets.com/download/free/day-sky-dome",
    },
]

HEADERS = {
    "User-Agent": "qoo109-Car asset importer/1.1 (+https://github.com/qoo109/Car)",
    "Accept": "text/html,application/zip,application/octet-stream,model/gltf-binary,*/*;q=0.8",
}


def fetch(url: str, *, referer: str | None = None) -> dict[str, object]:
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return {
            "data": response.read(),
            "content_type": response.headers.get("Content-Type", ""),
            "content_disposition": response.headers.get("Content-Disposition", ""),
            "final_url": response.geturl(),
            "status": response.status,
        }


def verify_free_page(asset: dict[str, str]) -> None:
    response = fetch(asset["source"])
    page = bytes(response["data"]).decode("utf-8", errors="replace")
    normalized = re.sub(r"\s+", " ", page)
    if "Free Commercial License" not in normalized or "Free" not in normalized:
        raise RuntimeError(f"{asset['name']} is not visibly marked Free Commercial License")
    if asset["name"] not in normalized:
        raise RuntimeError(f"Could not verify asset page identity for {asset['name']}")
    if "text/html" not in str(response["content_type"]).lower():
        raise RuntimeError(f"Unexpected asset page content type: {response['content_type']}")


def unpack_glb(response: dict[str, object], asset: dict[str, str]) -> tuple[bytes, dict[str, object]]:
    package = bytes(response["data"])
    metadata: dict[str, object] = {
        "downloadContentType": response["content_type"],
        "downloadContentDisposition": response["content_disposition"],
        "downloadFinalUrl": response["final_url"],
        "packageBytes": len(package),
        "packageSha256": hashlib.sha256(package).hexdigest(),
        "container": "raw-glb",
        "member": None,
    }

    if package[:4] == b"glTF":
        return package, metadata

    if package[:2] == b"PK":
        metadata["container"] = "zip"
        try:
            with zipfile.ZipFile(io.BytesIO(package)) as archive:
                members = [name for name in archive.namelist() if not name.endswith("/")]
                glb_members = [name for name in members if name.lower().endswith(".glb")]
                if not glb_members:
                    raise RuntimeError(f"ZIP has no GLB. Members: {members}")
                preferred = sorted(
                    glb_members,
                    key=lambda name: (
                        asset["slug"].replace("-", "") not in name.lower().replace("-", "").replace("_", ""),
                        len(name),
                        name,
                    ),
                )[0]
                metadata["member"] = preferred
                metadata["members"] = members
                return archive.read(preferred), metadata
        except zipfile.BadZipFile as error:
            raise RuntimeError("Download starts with ZIP magic but is not a valid ZIP") from error

    preview = package[:240].decode("utf-8", errors="replace").replace("\n", " ")
    raise RuntimeError(
        "Download is neither GLB nor ZIP: "
        f"status={response['status']} type={response['content_type']} "
        f"final={response['final_url']} first_bytes={package[:16]!r} preview={preview!r}"
    )


def parse_glb(data: bytes) -> dict[str, object]:
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError("Extracted member is not a GLB (missing glTF magic)")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise RuntimeError(f"Unsupported GLB version {version}")
    if declared_length != len(data):
        raise RuntimeError(f"GLB length mismatch: header={declared_length}, actual={len(data)}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("First GLB chunk is not JSON")
    document = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    return {
        "version": version,
        "generator": document.get("asset", {}).get("generator", ""),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "nodes": len(document.get("nodes", [])),
        "scenes": len(document.get("scenes", [])),
    }


def write_asset_module(records: list[dict[str, object]], downloaded_at: str) -> Path:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    path = GENERATED_DIR / "threejsassets-free-v91.js"
    payload = {
        str(record["key"]): {
            "name": record["name"],
            "sourceUrl": record["source"],
            "license": LICENSE_NAME,
            "licenseUrl": LICENSE_URL,
            "sha256": record["sha256"],
            "bytes": record["bytes"],
            "glb": record["glb"],
            "download": record["downloadMetadata"],
            "dataUri": "data:model/gltf-binary;base64," + record["base64"],
        }
        for record in records
    }
    source = (
        "// Generated by scripts/import_threejsassets_v91.py. Do not edit manually.\n"
        "// Raw GLBs are embedded in the shipped game and are not published as standalone files.\n"
        f"export const THREEJSASSETS_DOWNLOADED_AT = {json.dumps(downloaded_at)};\n"
        f"export const THREEJSASSETS_FREE = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n"
        "export default THREEJSASSETS_FREE;\n"
    )
    path.write_text(source, encoding="utf-8")
    return path


def write_license_doc(records: list[dict[str, object]], downloaded_at: str) -> Path:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    path = DOCS_DIR / "threejsassets-free-assets.md"
    lines = [
        "# threejsassets.com Free assets",
        "",
        f"Imported and verified: `{downloaded_at}`",
        "",
        "Every asset below was verified on its public page as **Free · Free Commercial License** before download.",
        "Raw downloads are not committed as standalone GLB files. The validated GLB payloads are embedded in the shipped game module.",
        "",
        "## License record",
        "",
        f"- License: **{LICENSE_NAME}**",
        f"- Terms: {LICENSE_URL}",
        "- Permitted uses include personal, open-source, educational, client, commercial, game, app and website projects, including modification and embedding.",
        "- The original assets may not be resold, mirrored, shared, redistributed, repackaged or offered as standalone assets, asset packs, templates, datasets or competing services.",
        "- Attribution is not required by the Free Asset License; sources are retained here for auditability.",
        "",
        "## Imported models",
        "",
        "| Model | Category | Source | GLB SHA-256 | GLB bytes | Download container | GLB validation |",
        "|---|---|---|---|---:|---|---|",
    ]
    for record in records:
        glb = record["glb"]
        download = record["downloadMetadata"]
        container = str(download["container"])
        if download.get("member"):
            container += f" → `{download['member']}`"
        details = (
            f"glTF {glb['version']}; {glb['meshes']} meshes; {glb['materials']} materials; "
            f"extensions {', '.join(glb['extensionsUsed']) or 'none'}"
        )
        lines.append(
            f"| {record['name']} | {record['category']} | {record['source']} | "
            f"`{record['sha256']}` | {record['bytes']} | {container} | {details} |"
        )
    lines.extend([
        "",
        "## Runtime integration",
        "",
        "- Three.js loader: `GLTFLoader` plus `DRACOLoader`.",
        "- `Car Sedan 01`: primary player and AI vehicle.",
        "- `Taxi 01`: yellow/taxi-style vehicle variation.",
        "- `Day Sky Dome`: clear-weather environment following the race camera.",
        "- Runtime: `js/v9.1-threejsassets.js`.",
        "- Embedded generated module: `js/generated/threejsassets-free-v91.js`.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def update_index() -> None:
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    text = text.replace("V9.0", "V9.1").replace("v=9.0", "v=9.1")
    text = text.replace("THREE.JS GLTF V9.0", "THREE.JS FREE ASSETS V9.1")
    text = text.replace("V9.0 THREE.JS · GLB 車模啟動", "V9.1 FREE GLB 資產啟動")
    text = text.replace("THREE.JS + GLB VEHICLE PIPELINE · V9.0", "THREE.JSASSETS FREE PIPELINE · V9.1")
    text = text.replace(
        "V9.0 已將玩家與 AI 車輛改用 Three.js r184 與 GLTFLoader 載入真正 GLB 模型，保留原本操控、AI、碰撞、六條賽道與晴朗起始。",
        "V9.1 僅採用 threejsassets.com 標示 Free 的 GLB：Car Sedan 01、Taxi 01 與 Day Sky Dome；使用 GLTFLoader／DRACOLoader 載入，並保留來源、授權與檔案雜湊紀錄。",
    )
    text = text.replace("Three.js r184", "Free GLB 車輛")
    text = text.replace("GLTFLoader 車模", "GLTFLoader／DRACOLoader")
    text = text.replace("保留既有遊戲系統", "來源與授權可追溯")
    text = text.replace('src="js/v9-three-cars.js?v=9.1"', 'src="js/v9.1-threejsassets.js?v=9.1"')
    path.write_text(text, encoding="utf-8")


def main() -> None:
    downloaded_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    records: list[dict[str, object]] = []
    print(f"Importer revision: {IMPORT_REVISION}")
    for asset in ASSETS:
        print(f"Verifying Free label: {asset['name']}")
        verify_free_page(asset)
        print(f"Downloading package: {asset['download']}")
        response = fetch(asset["download"], referer=asset["source"])
        glb_data, download_metadata = unpack_glb(response, asset)
        glb = parse_glb(glb_data)
        sha256 = hashlib.sha256(glb_data).hexdigest()
        records.append({
            **asset,
            "bytes": len(glb_data),
            "sha256": sha256,
            "glb": glb,
            "downloadMetadata": download_metadata,
            "base64": base64.b64encode(glb_data).decode("ascii"),
        })
        print(
            f"  OK container={download_metadata['container']} member={download_metadata.get('member')} "
            f"glb={len(glb_data)} bytes sha256={sha256} meshes={glb['meshes']} "
            f"extensions={glb['extensionsUsed']}"
        )

    module_path = write_asset_module(records, downloaded_at)
    license_path = write_license_doc(records, downloaded_at)
    update_index()
    print(f"Generated {module_path.relative_to(ROOT)}")
    print(f"Generated {license_path.relative_to(ROOT)}")
    print("Updated index.html to V9.1 test configuration.")


if __name__ == "__main__":
    main()
