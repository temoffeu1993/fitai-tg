import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            margin: "20px auto",
            maxWidth: 400,
            background: "#fff3cd",
            border: "2px solid #ffc107",
            borderRadius: 12,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h3 style={{ margin: "0 0 12px", color: "#856404", fontSize: 18 }}>
            ⚠️ Произошла ошибка
          </h3>
          <p style={{ margin: "0 0 12px", color: "#856404", fontSize: 14 }}>
            Не удалось отобразить эту страницу. Попробуйте:
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, color: "#856404" }}>
            <li>Обновить страницу</li>
            <li>Сгенерировать новую тренировку</li>
            <li>Вернуться назад</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: "#ffc107",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              color: "#000",
            }}
          >
            🔄 Обновить страницу
          </button>
          {this.state.error && (
            <details style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Детали ошибки (для разработчика)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "#f8f9fa",
                  borderRadius: 6,
                  overflow: "auto",
                  fontSize: 11,
                }}
              >
                {this.state.error.toString()}
                {"\n\n"}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
