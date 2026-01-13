#[test]
fn debug_test_header_path() {
    let markdown = r#"# Level 1

Content under L1.

## Level 2

Content under L2.

### Level 3

Content under L3.
"#;

    let chunks = super::chunk_markdown(markdown);

    for (i, chunk) in chunks.iter().enumerate() {
        eprintln!("Chunk {}: header_path = {:?}", i, chunk.header_path);
        eprintln!("  Content start: {:?}", chunk.content.lines().next());
    }

    // Find the chunk with "Content under L3"
    let level3_chunk = chunks
        .iter()
        .find(|chunk| chunk.content.contains("Content under L3"));
    assert!(level3_chunk.is_some());
    eprintln!(
        "\nFound Level 3 chunk: {:?}",
        level3_chunk.unwrap().header_path
    );
}
