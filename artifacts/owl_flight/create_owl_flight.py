"""Build and render a short 2D owl landing animation in Blender.

Run with: blender --background --python create_owl_flight.py
"""

from pathlib import Path
import math
import os
import bpy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TRANSPARENT = os.environ.get("OWL_TRANSPARENT") == "1"
OWL = ROOT / "public/assets/happy_owl_transparent.png"
CHAIR = ROOT / "public/assets/Gilded Cobalt Louis XIV Armchair-1.png"
BLEND = HERE / ("owl_flight_transparent.blend" if TRANSPARENT else "owl_flight.blend")
FRAMES = HERE / ("transparent_frames" if TRANSPARENT else "frames")
PREVIEW = HERE / ("owl_flight_transparent_preview.png" if TRANSPARENT else "owl_flight_preview.png")


def rgba(hex_color, alpha=1.0):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (alpha,)


def material(name, color=None, image_path=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    links = mat.node_tree.links
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    if image_path:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(image_path), check_existing=True)
        tex.extension = "CLIP"
        links.new(tex.outputs["Color"], emission.inputs["Color"])
        links.new(tex.outputs["Alpha"], mix.inputs[0])
    else:
        emission.inputs["Color"].default_value = rgba(color)
        mix.inputs[0].default_value = alpha
    return mat


def mesh_plane(name, width, height, z, mat, nx=1, ny=1):
    verts = []
    uvs = []
    faces = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            verts.append(((u - 0.5) * width, (v - 0.5) * height, 0))
            uvs.append((u, v))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.z = z
    obj.data.materials.append(mat)
    return obj


def ellipse(name, x, y, z, rx, ry, mat):
    verts = [(0, 0, 0)]
    for i in range(64):
        angle = 2 * math.pi * i / 64
        verts.append((rx * math.cos(angle), ry * math.sin(angle), 0))
    faces = [(0, i + 1, (i + 1) % 64 + 1) for i in range(64)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    obj.data.materials.append(mat)
    return obj


def line(name, points, bevel, mat, z):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, xy in zip(spline.points, points):
        p.co = (xy[0], xy[1], z, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def key(obj, frame, location=None, scale=None, rotation=None):
    if location is not None:
        obj.location = (*location, obj.location.z)
        obj.keyframe_insert(data_path="location", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame)
    if rotation is not None:
        obj.rotation_euler.z = math.radians(rotation)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = TRANSPARENT
scene.render.image_settings.color_mode = "RGBA"
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 168
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(FRAMES / "frame_")
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"

# The original has a theatrical room. The website version leaves that area clear.
seat_shadow = material("owl contact shadow", "092A70", alpha=0.25)
if not TRANSPARENT:
    wall = material("warm ivory wall", "F4E9D7")
    floor = material("honey floor", "D8BC91")
    trim = material("antique gold trim", "B58343")
    blue = material("deep cobalt molding", "173F9C")
    glow = material("soft golden halo", "F8D995", alpha=0.18)
    shadow = material("chair floor shadow", "3B2E40", alpha=0.25)
    mesh_plane("wall", 16, 9, -1.0, wall)
    floor_obj = mesh_plane("floor", 16, 2.0, -0.85, floor)
    floor_obj.location.y = -3.52
    line("baseboard shadow", [(-8, -2.55), (8, -2.55)], 0.045, blue, -0.75)
    line("baseboard highlight", [(-8, -2.48), (8, -2.48)], 0.018, trim, -0.7)
    for x in (-6.9, -2.1, 6.9):
        line("wall molding", [(x, -2.40), (x, 3.75)], 0.016, trim, -0.75)
    for x0, x1 in ((-6.6, -2.4), (2.0, 6.6)):
        line("wall panel", [(x0, -2.08), (x0, 3.55), (x1, 3.55), (x1, -2.08)], 0.012, trim, -0.75)
    ellipse("gold light behind throne", 3.15, 0.28, -0.62, 3.45, 3.45, glow)
    ellipse("chair shadow", 3.10, -3.82, -0.35, 2.82, 0.24, shadow)
chair_mat = material("chair image", image_path=CHAIR)
chair = mesh_plane("Gilded Cobalt Louis XIV Armchair", 6.53, 5.90, 0.0, chair_mat)
chair.location.x = 3.15
chair.location.y = -0.84  # Feet at -3.79; cushion top near -0.82.

contact = ellipse("landing shadow on cushion", 3.12, -1.10, 0.04, 0.60, 0.11, seat_shadow)
key(contact, 1, scale=(0, 0, 0))
key(contact, 99, scale=(0, 0, 0))
key(contact, 116, scale=(0.7, 0.7, 0.7))
key(contact, 132, scale=(1, 1, 1))

# The owl is a textured mesh. Shape keys bend the wing tips while the image stays
# sharp and recognizable. Its feet meet the cushion at the end of the flight.
owl_mat = material("happy owl image", image_path=OWL)
owl = mesh_plane("Happy owl", 2.28, 1.97, 0.11, owl_mat, nx=28, ny=24)
owl.shape_key_add(name="Wings up")
down = owl.shape_key_add(name="Wings down")
for vertex, target in zip(owl.data.vertices, down.data):
    u = vertex.co.x / 2.28 + 0.5
    v = vertex.co.y / 1.97 + 0.5
    left = max(0, min(1, (0.41 - u) / 0.34)) * max(0, min(1, (v - 0.20) / 0.35))
    right = max(0, min(1, (u - 0.64) / 0.34)) * max(0, min(1, (v - 0.08) / 0.36))
    influence = max(left, right)
    target.co.y -= 0.25 * influence
    target.co.x += 0.06 * left - 0.06 * right

flight = [
    (1, -9.2, -0.15, -7),
    (18, -6.7, 0.52, -5),
    (42, -3.6, 1.46, -1),
    (67, -0.42, 1.79, 2),
    (88, 1.55, 1.47, -3),
    (104, 2.75, 0.77, -5),
    (115, 3.10, 0.02, 0),
    (121, 3.10, -0.11, 1),  # Contact squash.
    (130, 3.10, 0.14, -1),  # Small rebound.
    (140, 3.10, 0.04, 0),
    (168, 3.10, 0.04, 0),
]
for frame, x, y, angle in flight:
    key(owl, frame, location=(x, y), rotation=angle)
key(owl, 1, scale=(1, 1, 1))
key(owl, 114, scale=(1, 1, 1))
key(owl, 121, scale=(1.08, 0.90, 1))
key(owl, 130, scale=(0.97, 1.04, 1))
key(owl, 140, scale=(1, 1, 1))

for frame in range(1, 113, 5):
    down.value = 0.0 if (frame // 5) % 2 == 0 else 1.0
    down.keyframe_insert(data_path="value", frame=frame)
down.value = 0.0
down.keyframe_insert(data_path="value", frame=116)
down.keyframe_insert(data_path="value", frame=168)
# A short trail of golden glints reinforces direction without obscuring the art.
spark = material("golden flight glints", "E5AC40", alpha=0.92)
for idx, (x, y, when) in enumerate((
    (-5.8, 0.31, 22), (-4.5, 0.93, 33), (-2.7, 1.08, 47),
    (-1.25, 1.45, 60), (0.4, 1.31, 75), (1.62, 0.87, 88),
)):
    s = 0.14 if idx % 2 else 0.20
    line("flight sparkle %d" % idx, [(x - s, y), (x + s, y)], 0.012, spark, 0.05)
    sparkle = line("flight sparkle vertical %d" % idx,
                   [(x, y - s), (x, y + s)], 0.012, spark, 0.05)
    for obj in (bpy.data.objects["flight sparkle %d" % idx], sparkle):
        key(obj, 1, scale=(0, 0, 0))
        key(obj, when - 3, scale=(0, 0, 0))
        key(obj, when + 3, scale=(1, 1, 1))
        key(obj, when + 18, scale=(0, 0, 0))

cam_data = bpy.data.cameras.new("Orthographic camera")
cam = bpy.data.objects.new("Orthographic camera", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, 0, 20)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 16
scene.camera = cam

scene.frame_set(140)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
if not os.environ.get("OWL_PREVIEW_ONLY"):
    FRAMES.mkdir(exist_ok=True)
    scene.render.filepath = str(FRAMES / "frame_")
    bpy.ops.render.render(animation=True)
