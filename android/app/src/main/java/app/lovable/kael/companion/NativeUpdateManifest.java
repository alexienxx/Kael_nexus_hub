package app.lovable.kael.companion;

import android.util.JsonReader;
import android.util.JsonToken;
import java.io.StringReader;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Actual network manifest parser: no coercion, duplicate keys or URL fallback. */
final class NativeUpdateManifest {
    static final long MAX_APK = 128L * 1024L * 1024L;
    final long versionCode, size;
    final String sha256, filename, path;
    private NativeUpdateManifest(long versionCode, long size, String sha256, String filename) {
        this.versionCode = versionCode; this.size = size; this.sha256 = sha256; this.filename = filename;
        this.path = "/app/download/" + filename;
    }
    static NativeUpdateManifest parse(byte[] bytes, String origin) throws Exception {
        if (bytes.length < 1 || bytes.length > 32768) throw new Exception("MANIFEST_SIZE_INVALID");
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        Object document;
        try (JsonReader reader = new JsonReader(new StringReader(text))) {
            reader.setLenient(false);
            document = read(reader, 0, new int[] {0});
            if (reader.peek() != JsonToken.END_DOCUMENT) throw new Exception("MANIFEST_TRAILING_DATA");
        }
        if (!(document instanceof Map)) throw new Exception("MANIFEST_NOT_OBJECT");
        Map<?, ?> value = (Map<?, ?>) document;
        long version = integer(value, "version_code"), size = integer(value, "apk_size_bytes");
        String sha = string(value, "apk_sha256"), filename = string(value, "apk_filename");
        if (version < 1 || version > Integer.MAX_VALUE || size < 1 || size > MAX_APK || !sha.matches("[a-f0-9]{64}")) {
            throw new Exception("MANIFEST_FIELDS_INVALID");
        }
        Matcher name = Pattern.compile("^kael-([1-9][0-9]{0,9})-([a-f0-9]{8,64})\\.apk$").matcher(filename);
        if (!name.matches() || !Long.toString(version).equals(name.group(1)) || !sha.startsWith(name.group(2))) {
            throw new Exception("MANIFEST_FILENAME_BINDING_INVALID");
        }
        URI download = new URI(string(value, "download_url"));
        String path = "/app/download/" + filename;
        if (!path.equals(download.getRawPath()) || download.getRawQuery() != null || download.getRawFragment() != null
                || download.getRawUserInfo() != null || (!download.isAbsolute() && download.getRawAuthority() != null)) {
            throw new Exception("MANIFEST_DOWNLOAD_BINDING_INVALID");
        }
        if (download.isAbsolute()) {
            String downloadOrigin = NativeUpdateController.approvedOrigin(download.getScheme() + "://" + download.getRawAuthority());
            if (!downloadOrigin.equals(origin)) throw new Exception("MANIFEST_DOWNLOAD_ORIGIN_INVALID");
        }
        return new NativeUpdateManifest(version, size, sha, filename);
    }
    private static long integer(Map<?, ?> values, String key) throws Exception {
        Object value = values.get(key);
        if (!(value instanceof Long)) throw new Exception("MANIFEST_INTEGER_REQUIRED");
        return (Long) value;
    }
    private static String string(Map<?, ?> values, String key) throws Exception {
        Object value = values.get(key);
        if (!(value instanceof String) || ((String) value).isEmpty()) throw new Exception("MANIFEST_STRING_REQUIRED");
        return (String) value;
    }
    private static Object read(JsonReader reader, int depth, int[] budget) throws Exception {
        if (depth > 8 || ++budget[0] > 512) throw new Exception("MANIFEST_STRUCTURE_LIMIT");
        switch (reader.peek()) {
            case BEGIN_OBJECT:
                Map<String, Object> object = new LinkedHashMap<>();
                reader.beginObject();
                while (reader.hasNext()) {
                    String key = reader.nextName();
                    if (key.length() > 128 || object.containsKey(key)) throw new Exception("MANIFEST_DUPLICATE_KEY");
                    object.put(key, read(reader, depth + 1, budget));
                }
                reader.endObject(); return object;
            case BEGIN_ARRAY:
                List<Object> array = new ArrayList<>(); reader.beginArray();
                while (reader.hasNext()) array.add(read(reader, depth + 1, budget));
                reader.endArray(); return array;
            case STRING:
                String text = reader.nextString();
                if (text.length() > 16384) throw new Exception("MANIFEST_STRING_LIMIT");
                return text;
            case NUMBER:
                String number = reader.nextString();
                if (!number.matches("0|[1-9][0-9]{0,18}")) throw new Exception("MANIFEST_INTEGER_REQUIRED");
                return Long.valueOf(number);
            case BOOLEAN: return reader.nextBoolean();
            case NULL: reader.nextNull(); return null;
            default: throw new Exception("MANIFEST_TOKEN_INVALID");
        }
    }
}
