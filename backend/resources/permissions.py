from rest_framework.permissions import BasePermission, SAFE_METHODS

class CanCreateResource(BasePermission):
    """
    Permission allowing only Administrators, Facility Managers, Resource Custodians,
    or Superusers to create new campus resources.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        return bool(
            request.user.is_admin_role
            or request.user.is_facility_mgr_role
            or request.user.is_custodian_role
            or request.user.is_superuser
        )

class IsCustodianOrAdminForResource(BasePermission):
    """
    Custom permission allowing read access to all users,
    and modification/deletion only to the assigned resource custodian,
    Facility Managers, or Administrators.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_admin_role or request.user.is_facility_mgr_role or request.user.is_superuser:
            return True
        return obj.custodian == request.user

