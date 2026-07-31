<?php
// Shared helpers for the puzzle-photo photo library API.

define('PIN_HASH', hash('sha256', 'Gueguette22'));
define('STORE_DIR', __DIR__ . '/store');
define('THUMB_DIR', STORE_DIR . '/thumbs');
define('INDEX_FILE', STORE_DIR . '/index.json');
define('MAX_UPLOAD_BYTES', 15 * 1024 * 1024);

function send_cors_headers() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_response($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function check_pin($pin) {
    if (!is_string($pin) || $pin === '') return false;
    return hash_equals(PIN_HASH, hash('sha256', $pin));
}

function require_pin($pin) {
    if (!check_pin($pin)) {
        json_response(['error' => 'invalid_pin'], 401);
    }
}

function ensure_dirs() {
    if (!is_dir(STORE_DIR)) mkdir(STORE_DIR, 0750, true);
    if (!is_dir(THUMB_DIR)) mkdir(THUMB_DIR, 0750, true);
    if (!file_exists(INDEX_FILE)) file_put_contents(INDEX_FILE, '[]');
}

function read_index() {
    ensure_dirs();
    $raw = file_get_contents(INDEX_FILE);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function write_index($data) {
    ensure_dirs();
    $fp = fopen(INDEX_FILE, 'c+');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode(array_values($data)));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}

function get_json_input() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
