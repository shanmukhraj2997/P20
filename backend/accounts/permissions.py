from rest_framework.permissions import BasePermission
from accounts.models import User

class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_STUDENT)

class IsFaculty(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_FACULTY)

class IsCustodian(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_CUSTODIAN)

class IsDepartmentHead(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_DEPT_HEAD)

class IsFacilityManager(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_FACILITY_MGR)

class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == User.ROLE_ADMIN or request.user.is_superuser))
