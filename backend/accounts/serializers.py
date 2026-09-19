from rest_framework import serializers
from django.contrib.auth import authenticate
from accounts.models import User

class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'role_display', 'department', 'phone_number',
            'is_active', 'is_staff', 'is_superuser', 'date_joined'
        ]
        read_only_fields = ['id', 'is_active', 'is_staff', 'is_superuser', 'date_joined']

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'role', 'department', 'phone_number']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if username and password:
            user = authenticate(username=username, password=password)
            if not user:
                raise serializers.ValidationError({"detail": "Invalid credentials provided."})
            if not user.is_active:
                raise serializers.ValidationError({"detail": "User account is disabled."})
            data['user'] = user
        else:
            raise serializers.ValidationError({"detail": "Must include both username and password."})

        return data
