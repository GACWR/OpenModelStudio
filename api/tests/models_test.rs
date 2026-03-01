use openmodelstudio_api::middleware::auth::check_role;
use openmodelstudio_api::auth::Claims;
use openmodelstudio_api::models::user::UserRole;
use uuid::Uuid;

fn make_claims(role: UserRole) -> Claims {
    Claims {
        sub: Uuid::new_v4(),
        email: "test@example.com".into(),
        role,
        exp: chrono::Utc::now().timestamp() + 3600,
        iat: chrono::Utc::now().timestamp(),
        token_type: "access".into(),
    }
}

#[test]
fn test_admin_can_access_admin_routes() {
    let claims = make_claims(UserRole::Admin);
    assert!(check_role(&claims, &UserRole::Admin).is_ok());
}

#[test]
fn test_member_cannot_access_admin_routes() {
    let claims = make_claims(UserRole::Member);
    assert!(check_role(&claims, &UserRole::Admin).is_err());
}

#[test]
fn test_manager_can_access_manager_routes() {
    let claims = make_claims(UserRole::Manager);
    assert!(check_role(&claims, &UserRole::Manager).is_ok());
}

#[test]
fn test_viewer_cannot_access_member_routes() {
    let claims = make_claims(UserRole::Viewer);
    assert!(check_role(&claims, &UserRole::Member).is_err());
}
