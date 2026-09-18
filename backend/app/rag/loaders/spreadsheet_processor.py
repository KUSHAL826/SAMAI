import io

import pandas as pd


def extract_text(file_bytes: bytes, file_type: str) -> str:
    """Converts each sheet/CSV into readable 'Column: value' rows so a
    text-based RAG pipeline can index it just like prose content."""
    file_type = file_type.lower()

    if file_type == "csv":
        sheets = {"Sheet1": pd.read_csv(io.BytesIO(file_bytes))}
    else:
        sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)

    blocks = []
    for sheet_name, df in sheets.items():
        df = df.fillna("")
        blocks.append(f"[Sheet: {sheet_name}]")
        for _, row in df.iterrows():
            row_text = "; ".join(f"{col}: {val}" for col, val in row.items() if str(val).strip())
            if row_text:
                blocks.append(row_text)

    return "\n".join(blocks)
