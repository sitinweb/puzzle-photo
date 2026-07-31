<?php
require __DIR__ . '/lib.php';
send_cors_headers();

$input = get_json_input();
$pin = isset($input['pin']) ? $input['pin'] : '';
require_pin($pin);

$index = read_index();
usort($index, function ($a, $b) { return $b['uploadedAt'] <=> $a['uploadedAt']; });

$items = [];
foreach ($index as $entry) {
    $thumbPath = THUMB_DIR . '/' . $entry['id'] . '.jpg';
    $thumb = null;
    if (file_exists($thumbPath)) {
        $thumb = 'data:image/jpeg;base64,' . base64_encode(file_get_contents($thumbPath));
    }
    $items[] = [
        'id' => $entry['id'],
        'name' => isset($entry['name']) ? $entry['name'] : '',
        'uploadedAt' => $entry['uploadedAt'],
        'thumb' => $thumb
    ];
}

json_response(['ok' => true, 'items' => $items]);
