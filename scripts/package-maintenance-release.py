#!/usr/bin/env python3
"""Build deterministic GitHub release assets without changing workspace manifests.

Usage: python3 scripts/package-maintenance-release.py TAG OUTPUT_DIRECTORY
The command does not publish. release-manifest.json records dirty source explicitly;
publish only a clean, verified source commit and upload every generated archive and the manifest.
"""

import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "CaliLuke/hey-api"


def run(*args, cwd=ROOT):
    """Run build/pack commands with visible output and fail on any error."""
    subprocess.run(args, cwd=cwd, check=True)


def pack(package, destination, replacements):
    """Let pnpm resolve workspace metadata, then normalize the complete archive."""
    with tempfile.TemporaryDirectory(prefix="hey-api-pack-") as directory:
        run("pnpm", "pack", "--pack-destination", directory, cwd=ROOT / "packages" / package)
        archives = list(Path(directory).glob("*.tgz"))
        if len(archives) != 1:
            raise RuntimeError(f"Expected one package archive, got {archives}")
        archive = archives[0]
        with tarfile.open(archive) as source:
            contents = {}
            for member in source.getmembers():
                if not member.isfile():
                    raise RuntimeError(f"Unexpected archive member: {member.name}")
                contents[member.name] = (member.mode, source.extractfile(member).read())
        mode, data = contents["package/package.json"]
        manifest = json.loads(data)
        for name, url in replacements.items():
            if name not in manifest["dependencies"]:
                raise RuntimeError(f"Missing expected dependency {name}")
            manifest["dependencies"][name] = url
        # pnpm resolves workspace dependencies concurrently. Normalize only maps
        # whose order has no meaning; conditional exports/imports are order-sensitive.
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            if key in manifest:
                manifest[key] = dict(sorted(manifest[key].items()))
        contents["package/package.json"] = (mode, (json.dumps(manifest, indent=2) + "\n").encode())
        output = destination / archive.name
        with output.open("wb") as file, gzip.GzipFile(fileobj=file, mode="wb", filename="", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as target:
                for name, (mode, data) in sorted(contents.items()):
                    member = tarfile.TarInfo(name)
                    member.mode = mode
                    member.size = len(data)
                    member.mtime = 0
                    target.addfile(member, io.BytesIO(data))
        return output


def main():
    if len(sys.argv) != 3 or not re.fullmatch(r"[A-Za-z0-9._-]+", sys.argv[1]):
        raise SystemExit(__doc__)
    tag, destination = sys.argv[1], Path(sys.argv[2]).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise SystemExit("Output directory must be empty")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())
    run("pnpm", "build", "--filter=@hey-api/openapi-ts...", "--filter=@hey-api/shared...")
    # Release the complete production workspace closure. Otherwise updated parser
    # or code-generation dependencies could silently resolve to old npm releases.
    packages = {}
    for file in (ROOT / "packages").glob("*/package.json"):
        package = json.loads(file.read_text())
        packages[package["name"]] = (file.parent.name, package)
    archives = {}
    visiting = set()

    def package_dependency(name):
        if name in archives:
            return archives[name]
        if name in visiting:
            raise RuntimeError(f"Circular production workspace dependency: {name}")
        visiting.add(name)
        folder, package = packages[name]
        replacements = {}
        for dependency, version in package.get("dependencies", {}).items():
            if version.startswith("workspace:"):
                archive = package_dependency(dependency)
                replacements[dependency] = f"https://github.com/{REPOSITORY}/releases/download/{tag}/{archive.name}"
        archive = pack(folder, destination, replacements)
        archives[name] = archive
        visiting.remove(name)
        return archive

    package_dependency("@hey-api/openapi-ts")
    manifest = {
        "repository": REPOSITORY,
        "tag": tag,
        "sourceCommit": commit,
        "sourceDirty": dirty,
        "assets": {
            file.name: {"sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "bytes": file.stat().st_size}
            for file in archives.values()
        },
    }
    (destination / "release-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
