<?php
require __DIR__ . '/lib.php';
send_cors_headers();

$input = get_json_input();
$pin = isset($input['pin']) ? $input['pin'] : '';
require_pin($pin);

$id = isset($input['id']) ? $input['id'] : '';
if (!preg_match('/^[a-f0-9]{24}$/', $id)) {
    json_response(['error' => 'bad_id'], 400);
}

$index = read_index();
$found = null;
foreach ($index as $entry) {
    if ($entry['id'] === $id) { $found = $entry; break; }
}
if (!$found) {
    json_response(['error' => 'not_found'], 404);
}

$path = STORE_DIR . '/' . $found['file'];
if (!file_exists($path)) {
    json_response(['error' => 'missing_file'], 404);
}

$mimeMap = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
$ext = strtolower(pathinfo($found['file'], PATHINFO_EXTENSION));
$mime = isset($mimeMap[$ext]) ? $mimeMap[$ext] : 'application/octet-stream';

json_response([
    'ok' => true,
    'id' => $id,
    'name' => isset($found['name']) ? $found['name'] : '',
    'dataUrl' => 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($path))
]);
