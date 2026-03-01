use openmodelstudio_api::auth::*;
use openmodelstudio_api::models::user::UserRole;
use uuid::Uuid;

#[test]
fn test_password_hash_and_verify() {
    let password = "test_password_123!";
    let hash = hash_password(password).unwrap();
    assert!(verify_password(password, &hash).unwrap());
    assert!(!verify_password("wrong_password", &hash).unwrap());
}

#[test]
fn test_jwt_create_and_validate() {
    let user_id = Uuid::new_v4();
    let secret = "test-secret-key";

    let token = create_access_token(user_id, "test@example.com", UserRole::Member, secret).unwrap();
    let claims = validate_token(&token, secret).unwrap();

    assert_eq!(claims.sub, user_id);
    assert_eq!(claims.email, "test@example.com");
    assert_eq!(claims.token_type, "access");
}

#[test]
fn test_refresh_token() {
    let user_id = Uuid::new_v4();
    let secret = "test-refresh-secret";

    let token = create_refresh_token(user_id, "test@example.com", UserRole::Admin, secret).unwrap();
    let claims = validate_token(&token, secret).unwrap();

    assert_eq!(claims.sub, user_id);
    assert_eq!(claims.token_type, "refresh");
}

#[test]
fn test_invalid_token_fails() {
    let result = validate_token("invalid.token.here", "secret");
    assert!(result.is_err());
}

#[test]
fn test_wrong_secret_fails() {
    let user_id = Uuid::new_v4();
    let token = create_access_token(user_id, "test@example.com", UserRole::Member, "secret1").unwrap();
    let result = validate_token(&token, "secret2");
    assert!(result.is_err());
}
