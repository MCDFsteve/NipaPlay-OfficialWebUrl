<?php
/**
 * NipaPlay观看进度云同步API - JSON文件版本
 * 用于处理用户观看进度的上传和下载
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, User-Agent');

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 配置
$DATA_DIR = __DIR__ . '/watch_progress_data';
$LOG_FILE = __DIR__ . '/watch_progress_sync.log';

// 确保数据目录存在
if (!is_dir($DATA_DIR)) {
    if (!mkdir($DATA_DIR, 0755, true)) {
        sendResponse(false, null, '无法创建数据目录');
    }
}

// 响应函数
function sendResponse($success, $data = null, $error = null) {
    $response = ['success' => $success];
    if ($data !== null) {
        $response = array_merge($response, $data);
    }
    if ($error !== null) {
        $response['error'] = $error;
    }
    echo json_encode($response);
    exit();
}

// 日志函数
function logMessage($message) {
    global $LOG_FILE;
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($LOG_FILE, "[$timestamp] $message\n", FILE_APPEND | LOCK_EX);
}

// 获取用户数据文件路径
function getUserDataFile($username) {
    global $DATA_DIR;
    // 使用md5确保文件名安全
    $safeUsername = md5($username);
    return $DATA_DIR . '/' . $safeUsername . '.json';
}

// 读取用户数据
function loadUserData($username) {
    $dataFile = getUserDataFile($username);
    if (!file_exists($dataFile)) {
        return ['progress' => [], 'last_updated' => time()];
    }
    
    $content = file_get_contents($dataFile);
    if ($content === false) {
        return ['progress' => [], 'last_updated' => time()];
    }
    
    $data = json_decode($content, true);
    if (!$data || !is_array($data)) {
        return ['progress' => [], 'last_updated' => time()];
    }
    
    return $data;
}

// 保存用户数据
function saveUserData($username, $data) {
    $dataFile = getUserDataFile($username);
    $data['last_updated'] = time();
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($jsonData === false) {
        return false;
    }
    
    // 使用临时文件确保原子性写入
    $tempFile = $dataFile . '.tmp';
    if (file_put_contents($tempFile, $jsonData, LOCK_EX) === false) {
        return false;
    }
    
    return rename($tempFile, $dataFile);
}

try {
    // 只允许POST请求
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendResponse(false, null, '只支持POST请求');
    }
    
    // 获取请求数据
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        sendResponse(false, null, '无效的JSON数据');
    }
    
    $action = $input['action'] ?? '';
    
    switch ($action) {
        case 'upload':
            handleUpload($input);
            break;
            
        case 'download':
            handleDownload($input);
            break;
            
        default:
            sendResponse(false, null, '无效的操作类型');
    }
    
} catch (Exception $e) {
    logMessage("系统错误: " . $e->getMessage());
    sendResponse(false, null, '系统错误');
}

/**
 * 处理观看进度上传
 */
function handleUpload($input) {
    // 验证必要参数
    $episodeId = $input['episodeId'] ?? null;
    $animeId = $input['animeId'] ?? null;
    $username = $input['username'] ?? null;
    $position = $input['position'] ?? null;
    $timestamp = $input['timestamp'] ?? time() * 1000;
    
    if (!$episodeId || !$animeId || !$username || $position === null) {
        sendResponse(false, null, '缺少必要参数');
    }
    
    // 验证数据类型
    if (!is_numeric($episodeId) || !is_numeric($animeId) || !is_numeric($position)) {
        sendResponse(false, null, '参数类型错误');
    }
    
    $episodeId = (int)$episodeId;
    $animeId = (int)$animeId;
    $position = (int)$position;
    $username = trim($username);
    
    if ($episodeId <= 0 || $animeId <= 0 || $position < 0 || empty($username)) {
        sendResponse(false, null, '参数值无效');
    }
    
    try {
        // 加载用户数据
        $userData = loadUserData($username);
        
        // 生成进度键
        $progressKey = $episodeId . '_' . $animeId;
        
        // 检查是否需要更新（只有新的position更大时才更新）
        $shouldUpdate = true;
        if (isset($userData['progress'][$progressKey])) {
            $existingPosition = $userData['progress'][$progressKey]['position'] ?? 0;
            if ($position <= $existingPosition) {
                $shouldUpdate = false;
                logMessage("跳过过时的观看进度: $username, key=$progressKey, 新position=$position, 旧position=$existingPosition");
            }
        }
        
        if ($shouldUpdate) {
            // 更新进度数据
            $userData['progress'][$progressKey] = [
                'position' => $position,
                'episode_id' => $episodeId,
                'anime_id' => $animeId,
                'client_timestamp' => $timestamp,
                'updated_at' => time()
            ];
            
            // 保存数据
            if (saveUserData($username, $userData)) {
                logMessage("更新观看进度: $username, key=$progressKey, position=$position");
                sendResponse(true, ['message' => '观看进度上传成功']);
            } else {
                logMessage("保存用户数据失败: $username");
                sendResponse(false, null, '保存失败');
            }
        } else {
            sendResponse(true, ['message' => '观看进度已是最新']);
        }
        
    } catch (Exception $e) {
        logMessage("上传观看进度时出错: " . $e->getMessage());
        sendResponse(false, null, '上传失败');
    }
}

/**
 * 处理观看进度下载
 */
function handleDownload($input) {
    // 验证必要参数
    $username = $input['username'] ?? null;
    
    if (!$username) {
        sendResponse(false, null, '缺少用户名参数');
    }
    
    $username = trim($username);
    if (empty($username)) {
        sendResponse(false, null, '用户名不能为空');
    }
    
    try {
        // 加载用户数据
        $userData = loadUserData($username);
        
        // 转换为客户端期望的格式
        $progress = [];
        foreach ($userData['progress'] as $key => $data) {
            $progress[$key] = (int)$data['position'];
        }
        
        logMessage("下载观看进度: $username, 共" . count($progress) . "条记录");
        
        sendResponse(true, ['progress' => $progress]);
        
    } catch (Exception $e) {
        logMessage("下载观看进度时出错: " . $e->getMessage());
        sendResponse(false, null, '下载失败');
    }
}

?>

<!--
部署说明:
1. 将此文件保存为 watch_progress_sync.php 并上传到服务器
2. 确保PHP有创建目录和写入文件的权限
3. 脚本会自动创建 watch_progress_data/ 目录存储用户数据
4. 日志文件：watch_progress_sync.log
5. 建议使用HTTPS部署以保证数据安全

目录结构:
your_web_directory/
├── watch_progress_sync.php
├── watch_progress_sync.log
└── watch_progress_data/
    ├── md5hash1.json
    ├── md5hash2.json
    └── ...

每个用户的数据格式 (JSON):
{
    "progress": {
        "123_456": {
            "position": 60000,
            "episode_id": 123,
            "anime_id": 456,
            "client_timestamp": 1234567890000,
            "updated_at": 1234567890
        }
    },
    "last_updated": 1234567890
}
-->