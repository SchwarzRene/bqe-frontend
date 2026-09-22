def test_healthz_is_ok(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_docs_are_open_outside_production(client):
    # Production hides them; the test environment should not.
    assert client.get("/docs").status_code == 200
