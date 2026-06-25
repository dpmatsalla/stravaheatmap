<?php
$api_url = 'https://www.strava.com/api/v3';

if (isset($_GET['access_token']) && isset($_GET['page'])) {
    $access_token = $_GET['access_token'];
    $page = intval($_GET['page']);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "$api_url/athlete/activities?per_page=100&page=$page");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $access_token"
    ]);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        echo json_encode(['error' => curl_error($ch)]);
    } else {
        echo $response;
    }

    curl_close($ch);
}
?>