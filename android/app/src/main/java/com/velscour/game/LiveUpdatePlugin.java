package com.Velscour.game;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.ProcessedRoute;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "LiveUpdate")
public class LiveUpdatePlugin extends Plugin {
    private static final String PREFS_NAME = "VelscourLiveUpdate";
    private static final String KEY_INSTALLED_VERSION = "installed_version";
    private static final String KEY_INSTALLED_HASH = "installed_manifest_hash";
    private static final String KEY_APK_UPDATE_TIME = "apk_last_update_time";
    private static final String LIVE_DIR_NAME = "live_update";
    private static final String STAGING_DIR_NAME = "live_update_staging";
    private static final String LIVE_MANIFEST_FILE = "live_update_manifest.json";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public static File getLiveUpdateDir(Context context) {
        return new File(context.getFilesDir(), LIVE_DIR_NAME);
    }

    public static File getStagingDir(Context context) {
        return new File(context.getFilesDir(), STAGING_DIR_NAME);
    }

    public static File getLiveManifestFile(Context context) {
        return new File(context.getFilesDir(), LIVE_MANIFEST_FILE);
    }

    /**
     * Called on MainActivity startup before Bridge creation.
     * If the underlying APK was updated since the live update was installed,
     * clears stale overlay files so fresh APK assets are never shadowed by older files.
     */
    public static void initStartup(Context context) {
        try {
            PackageInfo pkgInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long currentApkTime = pkgInfo.lastUpdateTime;
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            long savedApkTime = prefs.getLong(KEY_APK_UPDATE_TIME, 0L);

            if (savedApkTime != 0L && savedApkTime != currentApkTime) {
                deleteRecursive(getLiveUpdateDir(context));
                deleteRecursive(getStagingDir(context));
                deleteRecursive(getLiveManifestFile(context));
                prefs.edit()
                    .remove(KEY_INSTALLED_VERSION)
                    .remove(KEY_INSTALLED_HASH)
                    .putLong(KEY_APK_UPDATE_TIME, currentApkTime)
                    .apply();
            } else if (savedApkTime == 0L) {
                prefs.edit().putLong(KEY_APK_UPDATE_TIME, currentApkTime).apply();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Per-file RouteProcessor for Capacitor's WebViewLocalServer.
     * Serves updated files from filesDir/live_update/ and falls back to bundled APK assets/public/
     * for all unchanged files on the same https://localhost origin.
     */
    public static ProcessedRoute processRoute(Context context, String basePath, String path) {
        ProcessedRoute route = new ProcessedRoute();
        String rawPath = path != null ? path : "/index.html";
        int qIdx = rawPath.indexOf('?');
        if (qIdx >= 0) rawPath = rawPath.substring(0, qIdx);
        int hIdx = rawPath.indexOf('#');
        if (hIdx >= 0) rawPath = rawPath.substring(0, hIdx);

        String relPath = rawPath.replaceAll("^/+", "");
        if (relPath.isEmpty()) {
            relPath = "index.html";
        }

        boolean safe = !relPath.contains("..");
        File liveDir = getLiveUpdateDir(context);
        File overrideFile = safe ? new File(liveDir, relPath) : null;

        if (overrideFile != null && overrideFile.exists() && overrideFile.isFile()) {
            if (basePath != null && !basePath.isEmpty()) {
                route.setPath(overrideFile.getAbsolutePath());
                route.setAsset(false);
            } else {
                route.setPath(Bridge.CAPACITOR_FILE_START + overrideFile.getAbsolutePath());
                route.setAsset(true);
                route.setIgnoreAssetPath(false);
            }
        } else {
            if (basePath != null && !basePath.isEmpty()) {
                route.setPath(basePath + "/index.html");
                route.setAsset(true);
            } else {
                route.setPath(rawPath.startsWith("/") ? rawPath : "/" + rawPath);
                route.setAsset(true);
                route.setIgnoreAssetPath(false);
            }
        }
        return route;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        executor.execute(() -> {
            try {
                Context ctx = getContext();
                SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                JSONObject apkManifest = readBundledManifest(ctx);
                String apkVersion = apkManifest != null ? apkManifest.optString("version", "0.1.0") : "0.1.0";
                String apkHash = apkManifest != null ? apkManifest.optString("manifestHash", "") : "";

                String installedVersion = prefs.getString(KEY_INSTALLED_VERSION, apkVersion);
                String installedHash = prefs.getString(KEY_INSTALLED_HASH, apkHash);

                File liveDir = getLiveUpdateDir(ctx);
                long[] stats = countDirStats(liveDir);

                JSObject ret = new JSObject();
                ret.put("available", true);
                ret.put("apkVersion", apkVersion);
                ret.put("apkManifestHash", apkHash);
                ret.put("installedVersion", installedVersion);
                ret.put("installedManifestHash", installedHash);
                ret.put("liveFilesCount", stats[0]);
                ret.put("liveBytes", stats[1]);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to get LiveUpdate info: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void computeDelta(PluginCall call) {
        JSObject serverFilesObj = call.getObject("files");
        if (serverFilesObj == null) {
            call.reject("Missing 'files' manifest map");
            return;
        }

        executor.execute(() -> {
            try {
                Context ctx = getContext();
                File liveDir = getLiveUpdateDir(ctx);
                JSONObject apkManifest = readBundledManifest(ctx);
                JSONObject apkFiles = apkManifest != null ? apkManifest.optJSONObject("files") : null;
                JSONObject liveManifest = readJsonFile(getLiveManifestFile(ctx));
                JSONObject liveFiles = liveManifest != null ? liveManifest.optJSONObject("files") : null;

                JSArray changedFiles = new JSArray();
                long totalDeltaBytes = 0L;

                Iterator<String> keys = serverFilesObj.keys();
                while (keys.hasNext()) {
                    String relPath = keys.next();
                    if (relPath == null || relPath.isEmpty() || relPath.contains("..")) continue;
                    JSONObject entry = serverFilesObj.optJSONObject(relPath);
                    if (entry == null) continue;

                    String serverHash = entry.optString("h", "");
                    long serverSize = entry.optLong("s", 0L);

                    String localHash = getLocalFileHash(ctx, liveDir, apkFiles, liveFiles, relPath);
                    if (localHash == null || !localHash.equalsIgnoreCase(serverHash)) {
                        JSObject item = new JSObject();
                        item.put("path", relPath);
                        item.put("h", serverHash);
                        item.put("s", serverSize);
                        changedFiles.put(item);
                        totalDeltaBytes += serverSize;
                    }
                }

                JSArray deletedFiles = new JSArray();
                List<String> existingLivePaths = new ArrayList<>();
                listRelativeFiles(liveDir, "", existingLivePaths);
                for (String existingRel : existingLivePaths) {
                    if (!serverFilesObj.has(existingRel)) {
                        deletedFiles.put(existingRel);
                    }
                }

                JSObject ret = new JSObject();
                ret.put("changedFiles", changedFiles);
                ret.put("deletedFiles", deletedFiles);
                ret.put("totalChangedCount", changedFiles.length());
                ret.put("totalDeltaBytes", totalDeltaBytes);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to compute delta: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void downloadAndApply(PluginCall call) {
        final String baseUrl = call.getString("baseUrl", "https://mmo.dagyr.me").replaceAll("/+$", "");
        final String targetVersion = call.getString("version", "0.1.0");
        final String targetManifestHash = call.getString("manifestHash", "");
        final JSONArray filesArr = call.getArray("files", new JSArray());
        final JSONArray deletedArr = call.getArray("deletedFiles", new JSArray());

        executor.execute(() -> {
            Context ctx = getContext();
            File stagingDir = getStagingDir(ctx);
            File liveDir = getLiveUpdateDir(ctx);

            try {
                if (!stagingDir.exists()) stagingDir.mkdirs();

                final int totalFiles = filesArr != null ? filesArr.length() : 0;
                long sumBytes = 0L;
                final List<JSONObject> fileList = new ArrayList<>(totalFiles);
                if (filesArr != null) {
                    for (int i = 0; i < totalFiles; i++) {
                        JSONObject f = filesArr.optJSONObject(i);
                        if (f != null) {
                            fileList.add(f);
                            sumBytes += Math.max(0L, f.optLong("s", 0L));
                        }
                    }
                }
                final long totalBytes = sumBytes;
                final AtomicInteger completedFiles = new AtomicInteger(0);
                final AtomicLong downloadedBytes = new AtomicLong(0L);
                final AtomicLong lastProgressEmit = new AtomicLong(0L);

                if (totalFiles > 0) {
                    int poolSize = Math.min(4, totalFiles);
                    ExecutorService dlPool = Executors.newFixedThreadPool(poolSize);
                    List<Future<Void>> futures = new ArrayList<>(totalFiles);

                    for (final JSONObject fileObj : fileList) {
                        futures.add(dlPool.submit(new Callable<Void>() {
                            @Override
                            public Void call() throws Exception {
                                String relPath = fileObj.optString("path", "");
                                String expectedHash = fileObj.optString("h", "");
                                long expectedSize = fileObj.optLong("s", 0L);

                                if (relPath.isEmpty() || relPath.contains("..")) {
                                    throw new IOException("Invalid file path: " + relPath);
                                }

                                File stagedFile = new File(stagingDir, relPath);
                                File parent = stagedFile.getParentFile();
                                if (parent != null && !parent.exists()) {
                                    synchronized (LiveUpdatePlugin.this) {
                                        parent.mkdirs();
                                    }
                                }

                                // Reuse already-staged file if SHA-256 matches (supports seamless resume)
                                if (stagedFile.exists() && stagedFile.isFile()) {
                                    String existingHash = sha256File16(stagedFile);
                                    if (!expectedHash.isEmpty() && expectedHash.equalsIgnoreCase(existingHash)) {
                                        long doneB = downloadedBytes.addAndGet(expectedSize > 0 ? expectedSize : stagedFile.length());
                                        int doneF = completedFiles.incrementAndGet();
                                        emitProgress("downloading", doneF, totalFiles, doneB, totalBytes, relPath);
                                        return null;
                                    }
                                }

                                File partFile = new File(stagingDir, relPath + ".part");
                                String encodedPath = encodeUrlPath(relPath);
                                String fileUrl = baseUrl + "/" + encodedPath + "?_v=" + Uri.encode(targetVersion) + "&_h=" + Uri.encode(expectedHash);

                                HttpURLConnection conn = null;
                                try {
                                    URL url = new URL(fileUrl);
                                    conn = (HttpURLConnection) url.openConnection();
                                    conn.setRequestMethod("GET");
                                    conn.setConnectTimeout(15000);
                                    conn.setReadTimeout(30000);
                                    conn.setUseCaches(false);
                                    conn.setRequestProperty("Cache-Control", "no-cache");

                                    int status = conn.getResponseCode();
                                    if (status < 200 || status >= 300) {
                                        throw new IOException("HTTP " + status + " downloading " + relPath);
                                    }

                                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                                    try (InputStream in = conn.getInputStream();
                                         FileOutputStream out = new FileOutputStream(partFile)) {
                                        byte[] buf = new byte[16384];
                                        int read;
                                        while ((read = in.read(buf)) != -1) {
                                            out.write(buf, 0, read);
                                            md.update(buf, 0, read);
                                            long curBytes = downloadedBytes.addAndGet(read);
                                            long now = System.currentTimeMillis();
                                            long prev = lastProgressEmit.get();
                                            if (now - prev >= 60 && lastProgressEmit.compareAndSet(prev, now)) {
                                                emitProgress("downloading", completedFiles.get(), totalFiles, curBytes, totalBytes, relPath);
                                            }
                                        }
                                        out.flush();
                                    }

                                    String actualHash = bytesToHex16(md.digest());
                                    if (!expectedHash.isEmpty() && !expectedHash.equalsIgnoreCase(actualHash)) {
                                        partFile.delete();
                                        throw new IOException("Hash mismatch for " + relPath + " (expected " + expectedHash + ", got " + actualHash + ")");
                                    }

                                    if (stagedFile.exists()) stagedFile.delete();
                                    if (!partFile.renameTo(stagedFile)) {
                                        copyFile(partFile, stagedFile);
                                        partFile.delete();
                                    }

                                    int doneF = completedFiles.incrementAndGet();
                                    emitProgress("downloading", doneF, totalFiles, downloadedBytes.get(), totalBytes, relPath);
                                    return null;
                                } finally {
                                    if (conn != null) conn.disconnect();
                                }
                            }
                        }));
                    }

                    dlPool.shutdown();
                    for (Future<Void> f : futures) {
                        f.get();
                    }
                }

                emitProgress("applying", totalFiles, totalFiles, totalBytes, totalBytes, "Applying update...");

                if (!liveDir.exists()) liveDir.mkdirs();

                // Load or initialize live_update_manifest.json
                JSONObject liveManifest = readJsonFile(getLiveManifestFile(ctx));
                if (liveManifest == null) liveManifest = new JSONObject();
                JSONObject liveFiles = liveManifest.optJSONObject("files");
                if (liveFiles == null) {
                    liveFiles = new JSONObject();
                    liveManifest.put("files", liveFiles);
                }

                // Atomically move verified staged files into live_update/
                for (JSONObject fileObj : fileList) {
                    String relPath = fileObj.optString("path", "");
                    if (relPath.isEmpty() || relPath.contains("..")) continue;
                    File stagedFile = new File(stagingDir, relPath);
                    File targetFile = new File(liveDir, relPath);
                    File parent = targetFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();

                    if (targetFile.exists()) targetFile.delete();
                    if (!stagedFile.renameTo(targetFile)) {
                        copyFile(stagedFile, targetFile);
                        stagedFile.delete();
                    }

                    JSONObject meta = new JSONObject();
                    meta.put("h", fileObj.optString("h", ""));
                    meta.put("s", targetFile.length());
                    liveFiles.put(relPath, meta);
                }

                // Remove deleted files from live_update/
                if (deletedArr != null) {
                    for (int i = 0; i < deletedArr.length(); i++) {
                        String delPath = deletedArr.optString(i, "");
                        if (!delPath.isEmpty() && !delPath.contains("..")) {
                            File delFile = new File(liveDir, delPath);
                            if (delFile.exists()) delFile.delete();
                            liveFiles.remove(delPath);
                        }
                    }
                }

                liveManifest.put("version", targetVersion);
                liveManifest.put("manifestHash", targetManifestHash);
                liveManifest.put("updatedAt", System.currentTimeMillis());
                writeJsonFile(getLiveManifestFile(ctx), liveManifest);

                deleteRecursive(stagingDir);

                SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit()
                    .putString(KEY_INSTALLED_VERSION, targetVersion)
                    .putString(KEY_INSTALLED_HASH, targetManifestHash)
                    .apply();

                if (bridge != null && bridge.getActivity() != null) {
                    bridge.getActivity().runOnUiThread(() -> {
                        try {
                            WebView wv = bridge.getWebView();
                            if (wv != null) {
                                wv.clearCache(true);
                            }
                        } catch (Exception ignored) {}
                    });
                }

                emitProgress("complete", totalFiles, totalFiles, totalBytes, totalBytes, "Complete");

                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("updatedFiles", totalFiles);
                res.put("version", targetVersion);
                res.put("manifestHash", targetManifestHash);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("In-game update failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void reset(PluginCall call) {
        executor.execute(() -> {
            try {
                Context ctx = getContext();
                deleteRecursive(getLiveUpdateDir(ctx));
                deleteRecursive(getStagingDir(ctx));
                deleteRecursive(getLiveManifestFile(ctx));

                SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit()
                    .remove(KEY_INSTALLED_VERSION)
                    .remove(KEY_INSTALLED_HASH)
                    .apply();

                if (bridge != null && bridge.getActivity() != null) {
                    bridge.getActivity().runOnUiThread(() -> {
                        try {
                            WebView wv = bridge.getWebView();
                            if (wv != null) wv.clearCache(true);
                        } catch (Exception ignored) {}
                    });
                }

                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to reset LiveUpdate: " + e.getMessage(), e);
            }
        });
    }

    private void emitProgress(String stage, int completedFiles, int totalFiles, long downloadedBytes, long totalBytes, String currentFile) {
        int percent = 100;
        if (totalBytes > 0) {
            percent = (int) Math.min(99L, Math.round((downloadedBytes * 100.0) / totalBytes));
        } else if (totalFiles > 0) {
            percent = (int) Math.min(99L, Math.round((completedFiles * 100.0) / totalFiles));
        }
        if ("complete".equals(stage)) percent = 100;

        JSObject prog = new JSObject();
        prog.put("stage", stage);
        prog.put("completedFiles", completedFiles);
        prog.put("totalFiles", totalFiles);
        prog.put("downloadedBytes", downloadedBytes);
        prog.put("totalBytes", totalBytes);
        prog.put("currentFile", currentFile);
        prog.put("percent", percent);
        notifyListeners("updateProgress", prog);
    }

    private static String getLocalFileHash(Context ctx, File liveDir, JSONObject apkFiles, JSONObject liveFiles, String relPath) {
        File liveFile = new File(liveDir, relPath);
        if (liveFile.exists() && liveFile.isFile()) {
            if (liveFiles != null) {
                JSONObject lf = liveFiles.optJSONObject(relPath);
                if (lf != null && lf.optLong("s", -1L) == liveFile.length()) {
                    String h = lf.optString("h", "");
                    if (!h.isEmpty()) return h;
                }
            }
            return sha256File16(liveFile);
        }

        if (apkFiles != null) {
            JSONObject af = apkFiles.optJSONObject(relPath);
            if (af != null) {
                String h = af.optString("h", "");
                if (!h.isEmpty()) return h;
            }
        }

        try (InputStream is = ctx.getAssets().open("public/" + relPath)) {
            return sha256Stream16(is);
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject readBundledManifest(Context ctx) {
        try (InputStream is = ctx.getAssets().open("public/update-manifest.json")) {
            String json = readStreamToString(is);
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject readJsonFile(File file) {
        if (file == null || !file.exists() || !file.isFile()) return null;
        try (InputStream is = new FileInputStream(file)) {
            return new JSONObject(readStreamToString(is));
        } catch (Exception e) {
            return null;
        }
    }

    private static void writeJsonFile(File file, JSONObject json) throws IOException {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(json.toString().getBytes(StandardCharsets.UTF_8));
            fos.flush();
        }
    }

    private static String readStreamToString(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int len;
        while ((len = is.read(buf)) != -1) {
            baos.write(buf, 0, len);
        }
        return baos.toString("UTF-8");
    }

    private static String sha256File16(File file) {
        try (InputStream is = new FileInputStream(file)) {
            return sha256Stream16(is);
        } catch (Exception e) {
            return null;
        }
    }

    private static String sha256Stream16(InputStream is) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[16384];
        int read;
        while ((read = is.read(buf)) != -1) {
            md.update(buf, 0, read);
        }
        return bytesToHex16(md.digest());
    }

    private static String bytesToHex16(byte[] bytes) {
        StringBuilder sb = new StringBuilder(16);
        for (int i = 0; i < 8 && i < bytes.length; i++) {
            sb.append(String.format("%02x", bytes[i] & 0xff));
        }
        return sb.toString();
    }

    private static String encodeUrlPath(String relPath) {
        String[] parts = relPath.split("/");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append("/");
            sb.append(Uri.encode(parts[i]));
        }
        return sb.toString();
    }

    private static void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[16384];
            int len;
            while ((len = in.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            out.flush();
        }
    }

    private static void listRelativeFiles(File dir, String prefix, List<String> out) {
        if (dir == null || !dir.exists()) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            String rel = prefix.isEmpty() ? child.getName() : prefix + "/" + child.getName();
            if (child.isDirectory()) {
                listRelativeFiles(child, rel, out);
            } else if (child.isFile()) {
                out.add(rel);
            }
        }
    }

    private static long[] countDirStats(File dir) {
        long[] res = new long[] { 0L, 0L };
        if (dir == null || !dir.exists()) return res;
        File[] children = dir.listFiles();
        if (children == null) return res;
        for (File child : children) {
            if (child.isDirectory()) {
                long[] sub = countDirStats(child);
                res[0] += sub[0];
                res[1] += sub[1];
            } else if (child.isFile()) {
                res[0] += 1L;
                res[1] += child.length();
            }
        }
        return res;
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursive(c);
            }
        }
        f.delete();
    }
}

