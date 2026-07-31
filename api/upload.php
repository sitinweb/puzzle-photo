<?php
require __DIR__ . '/lib.php';
send_cors_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'method_not_allowed'], 405);
}

$pin = isset($_POST['pin']) ? $_POST['pin'] : '';
require_pin($pin);

if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
    json_response(['error' => 'upload_failed'], 400);
}

$file = $_FILES['photo'];
if ($file['size'] > MAX_UPLOAD_BYTES) {
    json_response(['error' => 'too_large'], 400);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!isset($allowed[$mime])) {
    json_response(['error' => 'invalid_type'], 400);
}
$ext = $allowed[$mime];

ensure_dirs();
$id = bin2hex(random_bytes(12));
$destName = $id . '.' . $ext;
$dest = STORE_DIR . '/' . $destName;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    json_response(['error' => 'save_failed'], 500);
}

function make_thumbnail($srcPath, $mime, $destPath, $maxDim) {
    switch ($mime) {
        case 'image/jpeg': $src = @imagecreatefromjpeg($srcPath); break;
        case 'image/png': $src = @imagecreatefrompng($srcPath); break;
        case 'image/webp': $src = @imagecreatefromwebp($srcPath); break;
        default: $src = false;
    }
    if (!$src) return false;
    $w = imagesx($src); $h = imagesy($src);
    $scale = min(1, $maxDim / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    imagejpeg($dst, $destPath, 80);
    imagedestroy($src);
    imagedestroy($dst);
    return true;
}

make_thumbnail($dest, $mime, THUMB_DIR . '/' . $id . '.jpg', 320);

$name = isset($_POST['name']) ? trim(substr($_POST['name'], 0, 60)) : '';

$index = read_index();
$index[] = [
    'id' => $id,
    'file' => $destName,
    'name' => $name,
    'uploadedAt' => time()
];
write_index($index);

json_response(['ok' => true, 'id' => $id]);
