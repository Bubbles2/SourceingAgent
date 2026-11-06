"""Make an existing 7-second, 24 fps owl APNG repeat on a 10-second cycle.

Only APNG timing metadata changes; the rendered frames and transparency remain intact.
"""

from pathlib import Path
import os
import struct
import sys
import tempfile
import zlib


path = Path(sys.argv[1])
cycle_seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 10
signature = b"\x89PNG\r\n\x1a\n"
original = path.read_bytes()
assert original.startswith(signature)

chunks = []
position = len(signature)
while position < len(original):
    length = struct.unpack_from(">I", original, position)[0]
    kind = original[position + 4:position + 8]
    data = original[position + 8:position + 8 + length]
    chunks.append([kind, data])
    position += length + 12
    if kind == b"IEND":
        break

controls = [index for index, (kind, _) in enumerate(chunks) if kind == b"fcTL"]
assert controls, "No APNG frames found"
assert len(controls) == 168, "Expected the 168-frame owl animation"

for index, (kind, data) in enumerate(chunks):
    if kind == b"acTL":
        frame_count = struct.unpack_from(">I", data)[0]
        assert frame_count == len(controls)
        data = bytearray(data)
        struct.pack_into(">I", data, 4, 0)  # Infinite repeats.
        chunks[index][1] = bytes(data)
        break
else:
    raise ValueError("No APNG animation control found")

last = controls[-1]
data = bytearray(chunks[last][1])
assert len(data) == 26
last_delay_ticks = cycle_seconds * 24 - (len(controls) - 1)
assert 1 <= last_delay_ticks <= 65535
struct.pack_into(">HH", data, 20, last_delay_ticks, 24)
chunks[last][1] = bytes(data)

result = bytearray(signature)
for kind, data in chunks:
    result.extend(struct.pack(">I", len(data)))
    result.extend(kind)
    result.extend(data)
    result.extend(struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", delete=False) as temp:
    temp.write(result)
    temp_name = temp.name
os.replace(temp_name, path)
print(f"Updated {path}: {cycle_seconds}-second infinite loop")
