//! The local loopback HTTP listener that captures the Microsoft identity
//! platform's authorization-code redirect (ADR-0088's "Not yet built" item
//! -- now built for Batch 18 checkpoint 3, the Settings screen this needs
//! a live `connect()` for). RFC 8252 native-app guidance: a redirect URI
//! of `http://127.0.0.1:<port>/callback`, where Microsoft's redirect-URI
//! matching treats the port as insignificant for loopback addresses (see
//! `oauth.rs`'s own doc comment).
//!
//! Deliberately hand-rolled with `std::net::TcpListener` rather than a new
//! HTTP-server dependency: this only ever needs to read ONE request line
//! (the query string of a GET to `/callback`) and write back one small
//! fixed HTML response, once, then stop listening.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

/// What the redirect actually carried. Exactly one of `code` or `error`
/// is expected to be present on a well-formed redirect; a caller should
/// treat neither being present as `UnexpectedResponse`-shaped, matching
/// `oauth::OAuthError`'s own discipline of never silently proceeding on an
/// unrecognized shape.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CapturedRedirect {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Binds a fresh loopback listener on an OS-assigned port. Non-blocking so
/// `wait_for_redirect` can poll it against a deadline -- `TcpListener`
/// has no built-in accept timeout.
pub fn bind_loopback_listener() -> std::io::Result<TcpListener> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

/// The exact redirect URI to send to `oauth::build_authorization_url` for
/// a listener bound by `bind_loopback_listener`.
pub fn redirect_uri_for(listener: &TcpListener) -> std::io::Result<String> {
    let port = listener.local_addr()?.port();
    Ok(format!("http://127.0.0.1:{port}/callback"))
}

/// Blocks (polling every 100ms) until either a browser redirect arrives
/// or `timeout` elapses. On success, writes a minimal "you can close this
/// window" response back to the browser before returning.
pub fn wait_for_redirect(
    listener: &TcpListener,
    timeout: Duration,
) -> Result<CapturedRedirect, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => return handle_connection(stream),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(
                        "timed out waiting for the Microsoft sign-in page to redirect back"
                            .to_string(),
                    );
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn handle_connection(stream: TcpStream) -> Result<CapturedRedirect, String> {
    stream.set_nonblocking(false).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| e.to_string())?;
    let result = parse_request_line(&request_line);

    let body = "<html><body><p>Sign-in complete. You can close this window and return to \
                LIKHA-SIS.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let mut stream = stream;
    let _ = stream.write_all(response.as_bytes());
    Ok(result)
}

/// Parses `"GET /callback?code=...&state=...&error=... HTTP/1.1"`.
/// Tolerant of a malformed/empty line -- returns an all-`None` result
/// rather than panicking, since this reads bytes from an untrusted local
/// socket (in practice always the OS browser, but never assumed).
fn parse_request_line(line: &str) -> CapturedRedirect {
    let mut result = CapturedRedirect::default();
    let Some(path_and_query) = line.split_whitespace().nth(1) else {
        return result;
    };
    let Some((_, query)) = path_and_query.split_once('?') else {
        return result;
    };
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next().unwrap_or("");
        let value = percent_decode(parts.next().unwrap_or(""));
        match key {
            "code" => result.code = Some(value),
            "state" => result.state = Some(value),
            "error" => result.error = Some(value),
            _ => {}
        }
    }
    result
}

/// Minimal `application/x-www-form-urlencoded`-style decoder: `+` and
/// `%XX`. Sufficient for the value shapes Microsoft's redirect actually
/// sends (opaque codes/state, short error codes) -- see `oauth.rs`'s own
/// `percent_encode` doc comment for why this crate hand-rolls this rather
/// than adding a `url`/`percent-encoding` dependency for a handful of
/// query values it fully controls or narrowly consumes.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&value[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpStream as ClientStream;

    #[test]
    fn parse_request_line_extracts_code_and_state() {
        let result = parse_request_line("GET /callback?code=abc123&state=xyz789 HTTP/1.1\r\n");
        assert_eq!(result.code.as_deref(), Some("abc123"));
        assert_eq!(result.state.as_deref(), Some("xyz789"));
        assert_eq!(result.error, None);
    }

    #[test]
    fn parse_request_line_extracts_an_error_response() {
        let result = parse_request_line("GET /callback?error=access_denied&state=xyz HTTP/1.1\r\n");
        assert_eq!(result.error.as_deref(), Some("access_denied"));
        assert_eq!(result.code, None);
    }

    #[test]
    fn parse_request_line_percent_decodes_values() {
        let result = parse_request_line(
            "GET /callback?error=access_denied&error_description=The%20user%20cancelled. HTTP/1.1\r\n",
        );
        assert_eq!(result.error.as_deref(), Some("access_denied"));
    }

    #[test]
    fn parse_request_line_tolerates_a_request_with_no_query_string() {
        let result = parse_request_line("GET / HTTP/1.1\r\n");
        assert_eq!(result, CapturedRedirect::default());
    }

    #[test]
    fn parse_request_line_tolerates_a_blank_line() {
        assert_eq!(parse_request_line(""), CapturedRedirect::default());
    }

    #[test]
    fn wait_for_redirect_captures_a_real_loopback_connection() {
        let listener = bind_loopback_listener().unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = std::thread::spawn(move || {
            // Give the accept loop a moment to start polling.
            std::thread::sleep(Duration::from_millis(50));
            let mut client = ClientStream::connect(addr).unwrap();
            client
                .write_all(b"GET /callback?code=real-code&state=real-state HTTP/1.1\r\n\r\n")
                .unwrap();
            let mut buf = String::new();
            client.read_to_string(&mut buf).unwrap();
            buf
        });

        let redirect = wait_for_redirect(&listener, Duration::from_secs(5)).unwrap();
        let response_body = handle.join().unwrap();

        assert_eq!(redirect.code.as_deref(), Some("real-code"));
        assert_eq!(redirect.state.as_deref(), Some("real-state"));
        assert!(response_body.contains("200 OK"));
        assert!(response_body.contains("close this window"));
    }

    #[test]
    fn wait_for_redirect_times_out_when_nothing_ever_connects() {
        let listener = bind_loopback_listener().unwrap();

        let result = wait_for_redirect(&listener, Duration::from_millis(200));

        assert!(result.is_err());
    }
}
